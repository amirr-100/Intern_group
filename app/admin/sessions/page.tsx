'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import Link from 'next/link'

interface EventRow {
  id: string
  name: string
  event_date: string
  start_time: string
  location: string
  status: string
}

interface SessionRow {
  id: string
  name: string
  status: 'scheduled' | 'active' | 'ended'
  event_id: string
}

interface ActiveToken {
  token: string
  session_id: string
}

export default function SessionsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [events, setEvents] = useState<EventRow[]>([])
  const [sessions, setSessions] = useState<Record<string, SessionRow[]>>({})
  const [activeTokens, setActiveTokens] = useState<Record<string, ActiveToken>>({})
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [ending, setEnding] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!profile) return
    const isSuperAdmin = profile.role === 'super_admin'

    // Fetch today's and upcoming events only
    const today = new Date().toISOString().split('T')[0]
    let evQuery = supabase
      .from('events')
      .select('id, name, event_date, start_time, location, status')
      .gte('event_date', today)
      .not('status', 'eq', 'archived')
      .order('event_date', { ascending: true })

    if (!isSuperAdmin) evQuery = evQuery.eq('created_by', profile.id)

    const { data: evData } = await evQuery
    const eventList = (evData as EventRow[]) ?? []
    setEvents(eventList)

    if (eventList.length === 0) { setLoading(false); return }

    // Fetch sessions for all events
    const eventIds = eventList.map(e => e.id)
    const { data: sessData } = await supabase
      .from('sessions')
      .select('id, name, status, event_id')
      .in('event_id', eventIds)
      .order('created_at', { ascending: true })

    const sessMap: Record<string, SessionRow[]> = {}
    ;(sessData ?? []).forEach((s: SessionRow) => {
      if (!sessMap[s.event_id]) sessMap[s.event_id] = []
      sessMap[s.event_id].push(s)
    })
    setSessions(sessMap)

    // Fetch active tokens for active sessions
    const activeSessions = (sessData ?? []).filter((s: SessionRow) => s.status === 'active')
    if (activeSessions.length > 0) {
      const activeSessionIds = activeSessions.map((s: SessionRow) => s.id)
      const { data: tokenData } = await supabase
        .from('qr_tokens')
        .select('token, session_id')
        .in('session_id', activeSessionIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      const tokenMap: Record<string, ActiveToken> = {}
      ;(tokenData ?? []).forEach((t: ActiveToken) => {
        if (!tokenMap[t.session_id]) {
          tokenMap[t.session_id] = t
        }
      })

      // Auto-generate token for any active session that has none
      for (const sess of activeSessions) {
        if (!tokenMap[sess.id]) {
          const newToken = crypto.randomUUID()
          const expiry = new Date()
          expiry.setHours(expiry.getHours() + 24)
          const { error } = await supabase.from('qr_tokens').insert({
            session_id: sess.id,
            token: newToken,
            expires_at: expiry.toISOString(),
            is_active: true,
          })
          if (!error) {
            tokenMap[sess.id] = { token: newToken, session_id: sess.id }
          }
        }
      }

      setActiveTokens(tokenMap)
    }

    setLoading(false)
  }, [profile])

  useEffect(() => {
    if (!profile) return
    const run = async () => { await fetchAll() }
    run()
  }, [profile, fetchAll])

  const startSession = async (session: SessionRow) => {
    setStarting(session.id)
    try {
      // Start the session
      await supabase
        .from('sessions')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', session.id)

      // Generate one QR token valid for 24h (session end is the real gate)
      const token = crypto.randomUUID()
      const expiry = new Date()
      expiry.setHours(expiry.getHours() + 24)
      await supabase.from('qr_tokens').insert({
        session_id: session.id,
        token,
        expires_at: expiry.toISOString(),
        is_active: true,
      })

      await fetchAll()
    } catch (err) {
      console.error(err)
      alert('Failed to start session')
    } finally {
      setStarting(null)
    }
  }

  const endSession = async (session: SessionRow) => {
    if (!confirm('End this session? The QR code will stop working immediately.')) return
    setEnding(session.id)
    try {
      // Deactivate all tokens
      await supabase
        .from('qr_tokens')
        .update({ is_active: false })
        .eq('session_id', session.id)

      // End the session
      await supabase
        .from('sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', session.id)

      await fetchAll()
    } catch (err) {
      console.error(err)
    } finally {
      setEnding(null)
    }
  }

  const copyLink = (token: string, sessionId: string) => {
    const url = `${window.location.origin}/attend?token=${token}`
    navigator.clipboard.writeText(url)
    setCopied(sessionId)
    setTimeout(() => setCopied(null), 2000)
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Loading sessions…
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Sessions</h1>
        <p className="text-sm text-gray-500 mt-1">Start a session to generate a QR code for attendance</p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <p className="text-gray-500 text-sm mb-3">No upcoming events found.</p>
          <Link href="/admin/events/new" className="text-indigo-600 text-sm hover:underline">
            Create an event →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {events.map(event => {
            const eventSessions = sessions[event.id] ?? []
            return (
              <div key={event.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Event header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <Link href={`/admin/events/${event.id}`} className="font-semibold text-gray-900 hover:text-indigo-600 transition">
                      {event.name}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{event.start_time?.slice(0, 5)} · {event.location}
                    </p>
                  </div>
                  <Link href={`/admin/events/${event.id}`}
                    className="text-xs text-indigo-600 hover:underline shrink-0">
                    Manage →
                  </Link>
                </div>

                {/* Sessions */}
                {eventSessions.length === 0 ? (
                  <div className="px-5 py-6 text-center text-sm text-gray-400">
                    No sessions yet.{' '}
                    <Link href={`/admin/events/${event.id}`} className="text-indigo-600 hover:underline">
                      Create one →
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {eventSessions.map(session => {
                      const token = activeTokens[session.id]
                      const qrUrl = token && typeof window !== 'undefined' ? `${window.location.origin}/attend?token=${token.token}` : ''
                      const isActive = session.status === 'active'
                      const isEnded = session.status === 'ended'

                      return (
                        <div key={session.id} className="px-5 py-4">
                          <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${
                                isActive ? 'bg-green-500 animate-pulse' :
                                isEnded ? 'bg-gray-300' : 'bg-blue-400'
                              }`} />
                              <div>
                                <p className="text-sm font-medium text-gray-800">{session.name}</p>
                                <p className={`text-xs mt-0.5 ${
                                  isActive ? 'text-green-600' :
                                  isEnded ? 'text-gray-400' : 'text-blue-500'
                                }`}>
                                  {isActive ? 'Live — accepting check-ins' :
                                   isEnded ? 'Ended' : 'Not started'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {session.status === 'scheduled' && (
                                <button
                                  onClick={() => startSession(session)}
                                  disabled={starting === session.id}
                                  className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 transition disabled:opacity-50">
                                  {starting === session.id ? 'Starting…' : '▶ Start Session'}
                                </button>
                              )}
                              {isActive && (
                                <button
                                  onClick={() => endSession(session)}
                                  disabled={ending === session.id}
                                  className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-700 transition disabled:opacity-50">
                                  {ending === session.id ? 'Ending…' : '■ End Session'}
                                </button>
                              )}
                              <Link
                                href={`/admin/events/${event.id}/sessions/${session.id}/attendance`}
                                className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition">
                                Records
                              </Link>
                            </div>
                          </div>

                          {/* QR panel — only shown when active */}
                          {isActive && qrUrl && (
                            <div className="mt-4 flex flex-col sm:flex-row items-center gap-5 bg-gray-50 rounded-xl p-4 border border-gray-100">
                              <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm shrink-0">
                                <QRCodeSVG value={qrUrl} size={140} />
                              </div>
                              <div className="flex-1 min-w-0 text-center sm:text-left">
                                <p className="text-xs font-semibold text-gray-700 mb-1">Live check-in QR</p>
                                <p className="text-xs text-gray-500 mb-3">This QR stays active until you end the session. Display it on screen or share the link below.</p>
                                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 font-mono break-all mb-2">
                                  {qrUrl}
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => copyLink(token.token, session.id)}
                                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                                      copied === session.id
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}>
                                    {copied === session.id ? '✓ Copied!' : 'Copy check-in link'}
                                  </button>
                                  <button
                                    onClick={() => window.open(`/qr-display?token=${token.token}`, '_blank')}
                                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                                    </svg>
                                    Display QR
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Not started state */}
                          {session.status === 'scheduled' && (
                            <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-600">
                              No active session — click <strong>Start Session</strong> to generate a QR code and begin accepting attendance.
                            </div>
                          )}

                          {/* Ended state */}
                          {isEnded && (
                            <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-500">
                              Session ended. QR code is deactivated.{' '}
                              <Link href={`/admin/events/${event.id}/sessions/${session.id}/attendance`} className="text-indigo-600 hover:underline">
                                View attendance records →
                              </Link>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}