'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import Link from 'next/link'

const SESSION_DURATION_SECONDS = 300 // 5 minutes

interface Session {
  id: string
  name: string
  status: 'scheduled' | 'active' | 'paused' | 'ended'
  event_id: string
  qr_refresh_interval: number
  started_at: string | null
  ended_at: string | null
}

interface AttendanceSummary {
  total: number
  verified: number
  duplicate: number
}

function pad(n: number) { return String(n).padStart(2, '0') }
function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${pad(m)}:${pad(s)}`
}

export default function LiveSessionPage() {
  const { eventId, sessionId } = useParams<{ eventId: string; sessionId: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [currentToken, setCurrentToken] = useState('')
  const [origin, setOrigin] = useState('')
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | null>(null)
  const [qrCountdown, setQrCountdown] = useState(0)
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(SESSION_DURATION_SECONDS)
  const [summary, setSummary] = useState<AttendanceSummary>({ total: 0, verified: 0, duplicate: 0 })
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [copied, setCopied] = useState(false)

  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Set origin once (client only) ─────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin)
  }, [])

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, name, status, event_id, qr_refresh_interval, started_at, ended_at')
      .eq('id', sessionId)
      .single()
    if (error) console.error('Fetch session error:', error)
    if (data) setSession(data as Session)
    setLoading(false)
  }, [sessionId])

  const fetchSummary = useCallback(async () => {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('status')
      .eq('session_id', sessionId)
    if (error) console.error('Fetch summary error:', error)
    if (!data) return
    setSummary({
      total: data.length,
      verified: data.filter((r) => r.status === 'verified').length,
      duplicate: data.filter((r) => r.status === 'duplicate').length,
    })
  }, [sessionId])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      await fetchSession()
      if (!cancelled) await fetchSummary()
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    return () => { cancelled = true }
  }, [fetchSession, fetchSummary])

  // Real-time attendance updates
  useEffect(() => {
    const channel = supabase
      .channel(`session-live-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'attendance_records',
        filter: `session_id=eq.${sessionId}`,
      }, () => fetchSummary())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, fetchSummary])

  // ── QR generation (no created_by column) ─────────────────────────────────
  const generateToken = useCallback(async () => {
    // Deactivate old tokens for this session
    await supabase
      .from('qr_tokens')
      .update({ is_active: false })
      .eq('session_id', sessionId)
      .eq('is_active', true)

    const token = crypto.randomUUID()
    // Set expiry to 24h – actual validity is controlled by session status
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase.from('qr_tokens').insert({
      session_id: sessionId,
      token,
      expires_at: expiresAt,
      is_active: true,
    })

    if (error) {
      console.error('Generate token error:', error)
    } else {
      setCurrentToken(token)
      setTokenExpiresAt(new Date(expiresAt))
    }
  }, [sessionId])

  // ── Actions ────────────────────────────────────────────────────────────────
  const endSessionInternal = useCallback(async () => {
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (error) console.error('End session error:', error)
    await fetchSession()
    setCurrentToken('')
    setTokenExpiresAt(null)
  }, [sessionId, fetchSession])

  const startSession = async () => {
    setStarting(true)
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (error) console.error('Start session error:', error)
    await fetchSession()
    setStarting(false)
  }

  const endSession = async () => {
    if (!confirm('End this session? Attendees will no longer be able to check in.')) return
    setEnding(true)
    await endSessionInternal()
    setEnding(false)
  }

  // ── Start QR rotation when session becomes active ──────────────────────────
  useEffect(() => {
    if (session?.status !== 'active') {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current)
      return
    }

    let cancelled = false
    const initQR = async () => {
      await generateToken()
      if (cancelled) return
      const ms = (session.qr_refresh_interval || 10) * 1000
      qrIntervalRef.current = setInterval(generateToken, ms)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initQR()

    return () => {
      cancelled = true
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current)
    }
  }, [session?.status, session?.qr_refresh_interval, generateToken, session])

  // ── Dual countdown ticker ──────────────────────────────────────────────────
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (session?.status !== 'active' || !session.started_at) return

    const sessionStart = new Date(session.started_at).getTime()

    tickRef.current = setInterval(() => {
      const now = Date.now()

      const elapsed = Math.floor((now - sessionStart) / 1000)
      const left = Math.max(0, SESSION_DURATION_SECONDS - elapsed)
      setSessionSecondsLeft(left)

      if (tokenExpiresAt) {
        const qrLeft = Math.max(0, Math.ceil((tokenExpiresAt.getTime() - now) / 1000))
        setQrCountdown(qrLeft)
      }

      if (left === 0) {
        if (tickRef.current) clearInterval(tickRef.current)
        endSessionInternal()
      }
    }, 1000)

    return () => { if (tickRef.current) clearInterval(tickRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, session?.started_at, tokenExpiresAt, endSessionInternal])

  const copyLink = () => {
    if (!qrUrl) return
    navigator.clipboard.writeText(qrUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const qrUrl = origin && currentToken ? `${origin}/attend?token=${currentToken}` : ''
  const refreshInterval = session?.qr_refresh_interval ?? 10
  const qrProgressPct = refreshInterval > 0 ? (qrCountdown / refreshInterval) * 100 : 0
  const sessionProgressPct =
    SESSION_DURATION_SECONDS > 0
      ? ((SESSION_DURATION_SECONDS - sessionSecondsLeft) / SESSION_DURATION_SECONDS) * 100
      : 0

  const sessionUrgent = sessionSecondsLeft <= 60 && session?.status === 'active'

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading session…
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 text-sm">Session not found.</p>
        <Link href={`/admin/events/${eventId}`} className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
          Back to event
        </Link>
      </div>
    )
  }

  const statusStyles: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    active:    'bg-green-100 text-green-700',
    paused:    'bg-amber-100 text-amber-700',
    ended:     'bg-gray-200 text-gray-600',
  }

  return (
    <div className="max-w-4xl">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-7">
        <div>
          <Link href={`/admin/events/${eventId}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to event
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyles[session.status]}`}>
              {session.status}
            </span>
            {session.status === 'active' && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live · {formatDuration(sessionSecondsLeft)} remaining
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href={`/admin/events/${eventId}/sessions/${sessionId}/attendance`}
            className="inline-flex items-center gap-2 border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Attendance ({summary.total})
          </Link>
          {session.status === 'scheduled' && (
            <button onClick={startSession} disabled={starting}
              className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 transition shadow-sm disabled:opacity-60">
              {starting ? (
                <><Spinner /> Starting…</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>Start session</>
              )}
            </button>
          )}
          {session.status === 'active' && (
            <button onClick={endSession} disabled={ending}
              className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-700 transition shadow-sm disabled:opacity-60">
              {ending ? (
                <><Spinner /> Ending…</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>End session</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total check-ins', value: summary.total,     color: 'text-gray-900' },
          { label: 'Verified',        value: summary.verified,  color: 'text-green-600' },
          { label: 'Duplicates',      value: summary.duplicate, color: 'text-red-500'  },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 text-center">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Session time bar (active only) ── */}
      {session.status === 'active' && (
        <div className={`rounded-2xl border px-5 py-4 mb-6 ${sessionUrgent ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${sessionUrgent ? 'text-red-700' : 'text-gray-700'}`}>
              {sessionUrgent ? '⚠️ Session expiring soon' : 'Session duration'}
            </span>
            <span className={`text-xl font-bold tabular-nums ${sessionUrgent ? 'text-red-700' : 'text-gray-900'}`}>
              {formatDuration(sessionSecondsLeft)}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${sessionUrgent ? 'bg-red-500' : 'bg-indigo-500'}`}
              style={{ width: `${100 - sessionProgressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Session auto-ends after {SESSION_DURATION_SECONDS / 60} minutes · started {session.started_at
              ? new Date(session.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </p>
        </div>
      )}

      {/* ── QR panel ── */}
      {session.status === 'active' && qrUrl && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Live QR code</h2>
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Refreshes in {qrCountdown}s
            </span>
          </div>

          <div className="p-6 flex flex-col md:flex-row items-center gap-8">
            <div className="flex flex-col items-center gap-4 shrink-0">
              <div className="p-5 bg-white border-2 border-gray-100 rounded-3xl shadow-sm">
                <QRCode value={qrUrl} size={190} />
              </div>
              <div className="w-[210px]">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Code refreshes</span>
                  <span className="font-semibold tabular-nums text-indigo-600">{qrCountdown}s</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${qrProgressPct}%` }}
                  />
                </div>
              </div>
              <button onClick={copyLink}
                className={`w-[210px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                  copied
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>
                {copied ? (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>Link copied!</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>Copy check-in link</>
                )}
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">How attendees check in</h3>
              <ol className="space-y-3">
                {[
                  'Point phone camera at the QR code above',
                  'Tap the link that appears on your screen',
                  'Enter your name and phone number',
                  'Confirm and tap Submit',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Direct link (share manually)</p>
                <p className="text-xs text-gray-500 font-mono break-all leading-relaxed">{qrUrl}</p>
              </div>
              <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                <strong>Security note:</strong> The QR code changes every {refreshInterval} seconds. Screenshot
                reuse and old links will be automatically rejected.
              </div>
            </div>
          </div>
        </div>
      )}

      {session.status === 'scheduled' && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-10 text-center">
          <svg className="w-12 h-12 text-blue-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-base font-semibold text-blue-900 mb-2">Session not started</h3>
          <p className="text-sm text-blue-600 max-w-xs mx-auto">
            Click <strong>Start session</strong> above to generate a live QR code. The session will run for
            5 minutes and auto-close, or you can end it manually at any time.
          </p>
        </div>
      )}

      {session.status === 'ended' && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-base font-semibold text-gray-700 mb-2">Session ended</h3>
          <p className="text-sm text-gray-500 mb-5">
            Ended{' '}
            {session.ended_at
              ? new Date(session.ended_at).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })
              : ''}
            . All QR codes are now deactivated.
          </p>
          <Link href={`/admin/events/${eventId}/sessions/${sessionId}/attendance`}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">
            View attendance records →
          </Link>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}