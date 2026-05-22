'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────────
interface EventRow {
  id: string
  name: string
  event_date: string
  start_time: string
  location: string
  status: string
}

interface SessionWithToken {
  session_id: string
  token: string
}

// ── Pure helper (matches actual database columns) ─────────────────────────────
async function generateTokenForEvent(eventId: string, profileId: string) {
  // 1. Create a session if none exists
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('event_id', eventId)
    .in('status', ['active', 'scheduled'])   // ← 'scheduled' not 'upcoming'
    .limit(1)

  let sessionId: string

  if (sessions && sessions.length > 0) {
    sessionId = sessions[0].id
  } else {
    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        event_id: eventId,
        name: 'Check-in Session',
        status: 'scheduled',                 // ← valid enum value
        qr_refresh_interval: 10,
        created_by: profileId,
        // no start_time column
      })
      .select('id')
      .single()

    if (sessionError) throw sessionError
    sessionId = newSession.id
  }

  // 2. Generate a new QR token (valid for 24 hours)
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error: tokenError } = await supabase
    .from('qr_tokens')
    .insert({
      session_id: sessionId,
      token,
      expires_at: expiresAt,
      is_active: true,
      // no created_by column
    })

  if (tokenError) throw tokenError

  return { sessionId, token }
}

// ── Page Component ────────────────────────────────────────────────────────────
export default function SessionsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [events, setEvents] = useState<EventRow[]>([])
  const [tokens, setTokens] = useState<Record<string, SessionWithToken>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    if (!profile) return

    const isSuperAdmin = profile.role === 'super_admin'
    let query = supabase
      .from('events')
      .select('id, name, event_date, start_time, location, status')
      .in('status', ['upcoming', 'active'])
      .order('event_date', { ascending: true })

    if (!isSuperAdmin) query = query.eq('created_by', profile.id)

    const { data } = await query
    setEvents((data as EventRow[]) ?? [])
  }, [profile])

  const fetchTokens = useCallback(async (events: EventRow[]) => {
    if (events.length === 0) return
    const tokenMap: Record<string, SessionWithToken> = {}

    for (const ev of events) {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('event_id', ev.id)
        .in('status', ['active', 'scheduled'])   // ← 'scheduled' not 'upcoming'
        .order('created_at', { ascending: true }) // ← 'created_at' not 'start_time'
        .limit(1)

      if (!sessions || sessions.length === 0) continue

      const { data: tokenRows } = await supabase
        .from('qr_tokens')
        .select('token, expires_at, is_active')
        .eq('session_id', sessions[0].id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)

      if (tokenRows && tokenRows.length > 0) {
        tokenMap[ev.id] = {
          session_id: sessions[0].id,
          token: tokenRows[0].token,
        }
      }
    }
    setTokens(tokenMap)
  }, [])

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      await fetchEvents()
      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [profile, fetchEvents])

  useEffect(() => {
    if (events.length === 0) return

    let cancelled = false
    const loadTokens = async () => {
      await fetchTokens(events)
    }

    loadTokens()
    return () => { cancelled = true }
  }, [events, fetchTokens])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleGenerateToken = useCallback(async (eventId: string) => {
    setGenerating(eventId)
    try {
      const { sessionId, token } = await generateTokenForEvent(eventId, profile!.id)

      setTokens(prev => ({
        ...prev,
        [eventId]: { session_id: sessionId, token },
      }))
    } catch (err: unknown) {
      console.error('Generate token error:', err)
      alert('Error generating token: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setGenerating(null)
    }
  }, [profile])

  const getCheckInLink = useCallback((token: string) => {
    return `${window.location.origin}/attend?token=${token}`
  }, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Link copied!')
  }

  // ── Loading / Empty states ───────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <div className="animate-spin text-3xl mb-3">⏳</div>
        <p className="text-sm">Loading sessions…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Active Sessions</h1>
        <p className="text-sm text-gray-500 mt-1">Share check‑in links and QR codes</p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No upcoming or active events found.</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map(event => {
            const tokenData = tokens[event.id]
            const link = tokenData ? getCheckInLink(tokenData.token) : null
            return (
              <div key={event.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col">
                <Link href={`/admin/events/${event.id}`} className="hover:underline">
                  <h3 className="text-lg font-semibold text-gray-900">{event.name}</h3>
                </Link>
                <p className="text-sm text-gray-500 mt-1">{event.location}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(event.event_date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                  {' · '}{event.start_time?.slice(0,5)}
                </p>

                {link ? (
                  <>
                    <div className="flex justify-center my-5">
                      <QRCodeSVG value={link} size={150} />
                    </div>
                    <div className="mt-auto flex flex-col gap-2">
                      <input
                        readOnly
                        value={link}
                        className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(link)}
                        className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition"
                      >
                        Copy Check‑in Link
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 gap-4">
                    <p className="text-sm text-gray-500">No active token</p>
                    <button
                      onClick={() => handleGenerateToken(event.id)}
                      disabled={generating === event.id}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {generating === event.id ? 'Creating…' : 'Generate QR Link'}
                    </button>
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