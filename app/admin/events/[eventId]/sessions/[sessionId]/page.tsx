// app/admin/events/[eventId]/sessions/[sessionId]/page.tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import Link from 'next/link'

interface Session {
  id: string
  name: string
  status: 'scheduled' | 'active' | 'ended'
  event_id: string
  started_at: string | null
  ended_at: string | null
}

interface AttendanceSummary {
  total: number
  verified: number
  duplicate: number
}

export default function LiveSessionPage() {
  const { eventId, sessionId } = useParams<{ eventId: string; sessionId: string }>()
  const [session, setSession]   = useState<Session | null>(null)
  const [qrUrl, setQrUrl]       = useState('')
  const [summary, setSummary]   = useState<AttendanceSummary>({ total: 0, verified: 0, duplicate: 0 })
  const [loading, setLoading]   = useState(true)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding]     = useState(false)
  const [copied, setCopied]     = useState(false)

  const fetchSession = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select('id, name, status, event_id, started_at, ended_at')
      .eq('id', sessionId)
      .single()
    if (data) setSession(data as Session)
    setLoading(false)
  }, [sessionId])

  const fetchSummary = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_records')
      .select('status')
      .eq('session_id', sessionId)
    if (!data) return
    setSummary({
      total: data.length,
      verified: data.filter(r => r.status === 'verified').length,
      duplicate: data.filter(r => r.status === 'duplicate').length,
    })
  }, [sessionId])

  const fetchActiveToken = useCallback(async () => {
    const { data } = await supabase
      .from('qr_tokens')
      .select('token')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data && data.length > 0) {
      setQrUrl(`${window.location.origin}/attend?token=${data[0].token}`)
    }
  }, [sessionId])

  // Initial load — run all three in parallel for speed
  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchSession(), fetchSummary(), fetchActiveToken()])
    }
    load()
  }, [fetchSession, fetchSummary, fetchActiveToken])

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

  const QR_ROTATION_SECONDS = 10

  const generateNewToken = useCallback(async () => {
    // Deactivate all existing tokens for this session
    await supabase
      .from('qr_tokens')
      .update({ is_active: false })
      .eq('session_id', sessionId)
      .eq('is_active', true)

    // Insert new token valid for 1 minute (session status is real gate)
    const token = crypto.randomUUID()
    const expiry = new Date()
    expiry.setSeconds(expiry.getSeconds() + QR_ROTATION_SECONDS)
    await supabase.from('qr_tokens').insert({
      session_id: sessionId,
      token,
      expires_at: expiry.toISOString(),
      is_active: true,
    })

    setQrUrl(`${window.location.origin}/attend?token=${token}`)
  }, [sessionId])

  const startSession = async () => {
    setStarting(true)
    await supabase
      .from('sessions')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', sessionId)
    await generateNewToken()
    await fetchSession()
    setStarting(false)
  }

  const endSession = async () => {
    if (!confirm('End this session? The QR code will stop working immediately.')) return
    setEnding(true)

    // Deactivate all tokens first
    await supabase
      .from('qr_tokens')
      .update({ is_active: false })
      .eq('session_id', sessionId)
      .eq('is_active', true)

    // End the session
    await supabase
      .from('sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId)

    setQrUrl('')
    await fetchSession()
    setEnding(false)
  }

  const copyLink = () => {
    if (!qrUrl) return
    navigator.clipboard.writeText(qrUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
    ended:     'bg-gray-200 text-gray-600',
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
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
                Live — accepting check-ins
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href={`/admin/events/${eventId}/sessions/${sessionId}/attendance`}
            className="inline-flex items-center gap-2 border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
            Attendance ({summary.total})
          </Link>
          {session.status === 'scheduled' && (
            <button onClick={startSession} disabled={starting}
              className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 transition shadow-sm disabled:opacity-60">
              {starting ? 'Starting…' : '▶ Start Session'}
            </button>
          )}
          {session.status === 'active' && (
            <button onClick={endSession} disabled={ending}
              className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-700 transition shadow-sm disabled:opacity-60">
              {ending ? 'Ending…' : '■ End Session'}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total check-ins', value: summary.total,     color: 'text-gray-900' },
          { label: 'Verified',        value: summary.verified,  color: 'text-green-600' },
          { label: 'Duplicates',      value: summary.duplicate, color: 'text-red-500'  },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 text-center">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Scheduled — not started yet */}
      {session.status === 'scheduled' && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-10 text-center">
          <svg className="w-12 h-12 text-blue-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-base font-semibold text-blue-900 mb-2">No active session</h3>
          <p className="text-sm text-blue-600 max-w-xs mx-auto">
            Click <strong>Start Session</strong> above to generate a live QR code and begin accepting attendance.
            The QR stays fixed until you click End Session.
          </p>
        </div>
      )}

      {/* Active — show fixed QR */}
      {session.status === 'active' && qrUrl && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Live QR code</h2>
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Active — ends only when you click End Session
            </span>
          </div>
          <div className="p-6 flex flex-col md:flex-row items-center gap-8">
            <div className="flex flex-col items-center gap-4 shrink-0">
              <div className="p-5 bg-white border-2 border-gray-100 rounded-3xl shadow-sm">
                <QRCode value={qrUrl} size={190} />
              </div>
              <div className="flex flex-col gap-2 w-[210px]">
                <button onClick={copyLink}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                    copied ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}>
                  {copied ? '✓ Link copied!' : 'Copy check-in link'}
                </button>
                <button
                  onClick={() => window.open(`/qr-display?token=${qrUrl.split('token=')[1]}`, '_blank')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  Display QR on screen
                </button>
              </div>
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
              <div className="mt-3 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 text-xs text-green-700">
                This QR code is <strong>fixed</strong> for the entire session. It only stops working when you click <strong>End Session</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ended */}
      {session.status === 'ended' && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-base font-semibold text-gray-700 mb-2">Session ended</h3>
          <p className="text-sm text-gray-500 mb-5">
            Ended {session.ended_at
              ? new Date(session.ended_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
              : ''}. All QR codes are deactivated.
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