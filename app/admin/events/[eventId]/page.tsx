'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import Link from 'next/link'

// ── Updated types to match the actual database columns ──────────────────────
interface Event {
  id: string
  name: string
  event_date: string
  start_time: string
  end_time: string | null
  location: string
  description: string | null
  status: string
  created_by: string
}

interface Session {
  id: string
  name: string
  status: string
  qr_refresh_interval: number
  started_at: string | null      // ← correct column name
  ended_at: string | null        // ← correct column name
  created_at: string
}

interface QRToken {
  id: string
  token: string
  expires_at: string
  is_active: boolean
}

interface AttendanceRecord {
  id: string
  full_name: string
  phone: string
  email: string | null
  institution: string | null
  designation: string | null
  method: string
  status: string
  submitted_at: string
}

interface EventAttachment {
  id: string
  file_name: string
  file_url: string
  file_type: string | null
  created_at: string
}

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [event, setEvent] = useState<Event | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [qrToken, setQrToken] = useState<QRToken | null>(null)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [attachments, setAttachments] = useState<EventAttachment[]>([])

  const [loading, setLoading] = useState(true)
  const [creatingSession, setCreatingSession] = useState(false)
  const [generatingQR, setGeneratingQR] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Memoised fetch functions ──────────────────────────────────────────────
  const fetchEvent = useCallback(async () => {
    const { data: ev, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (error || !ev) {
      console.error('Fetch event error:', error)
      alert('Event not found')
      router.push('/admin/events')
      return
    }
    setEvent(ev as Event)

    // Fetch sessions – order by created_at (the table has no start_time)
    const { data: sess } = await supabase
      .from('sessions')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    setSessions((sess as Session[]) ?? [])
    setLoading(false)
  }, [eventId, router])

  const fetchAttendance = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('session_id', sessionId)
      .order('submitted_at', { ascending: false })
    setAttendance((data as AttendanceRecord[]) ?? [])
  }, [])

  const fetchQRToken = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('qr_tokens')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    setQrToken(data && data.length > 0 ? (data[0] as QRToken) : null)
  }, [])

  const fetchAttachments = useCallback(async () => {
    const { data } = await supabase
      .from('event_attachments')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
    setAttachments((data as EventAttachment[]) ?? [])
  }, [eventId])

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    if (!eventId) return

    let cancelled = false
    const load = async () => {
      await fetchEvent()
      if (!cancelled) setLoading(false)
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    return () => { cancelled = true }
  }, [eventId, profile, fetchEvent])

  useEffect(() => {
    if (!selectedSessionId) return

    let cancelled = false
    const loadSessionData = async () => {
      await fetchAttendance(selectedSessionId)
      if (cancelled) return
      await fetchQRToken(selectedSessionId)
    }

    loadSessionData()
    return () => { cancelled = true }
  }, [selectedSessionId, fetchAttendance, fetchQRToken])

  useEffect(() => {
    let cancelled = false
    const loadAttachments = async () => {
      await fetchAttachments()
    }

    loadAttachments()
    return () => { cancelled = true }
  }, [fetchAttachments])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreateSession = async () => {
    setCreatingSession(true)
    try {
      const { error } = await supabase.from('sessions').insert({
        event_id: eventId,
        name: `Session ${sessions.length + 1}`,
        status: 'scheduled',                 // ← correct enum value
        qr_refresh_interval: 3600,
        created_by: profile!.id,
      })
      if (error) throw error
      fetchEvent() // refresh sessions
    } catch (err: unknown) {
      console.error('Create session error:', err)
      alert('Failed to create session')
    } finally {
      setCreatingSession(false)
    }
  }

  const handleGenerateQR = async () => {
    if (!selectedSessionId) return
    setGeneratingQR(true)
    try {
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.from('qr_tokens').insert({
        session_id: selectedSessionId,
        token,
        expires_at: expiresAt,
        is_active: true,
        // no created_by column
      })
      if (error) throw error
      fetchQRToken(selectedSessionId)
    } catch (err: unknown) {
      console.error('Generate QR error:', err)
      alert('Failed to generate QR token')
    } finally {
      setGeneratingQR(false)
    }
  }

  const handleEndSession = async (sessionId: string) => {
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (error) console.error('End session error:', error)
    fetchEvent()
    if (selectedSessionId === sessionId) setSelectedSessionId(null)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const fileName = `${eventId}/${Date.now()}_${file.name}`
      const { error: storageError } = await supabase.storage
        .from('event-attachments')
        .upload(fileName, file)

      if (storageError) {
        console.error('Upload error:', storageError)
        alert('Upload failed: ' + storageError.message)
        continue
      }

      const { data: publicUrl } = supabase.storage
        .from('event-attachments')
        .getPublicUrl(fileName)

      const { error: insertError } = await supabase.from('event_attachments').insert({
        event_id: eventId,
        file_name: file.name,
        file_url: publicUrl.publicUrl,
        file_type: file.type,
        uploaded_by: profile!.id,
      })
      if (insertError) console.error('Attachment insert error:', insertError)
    }
    setUploading(false)
    fetchAttachments()
  }

  const exportCSV = () => {
    if (attendance.length === 0) return
    const header = ['Name', 'Phone', 'Email', 'Institution', 'Designation', 'Method', 'Status', 'Time']
    const rows = attendance.map(r => [
      r.full_name, r.phone, r.email ?? '', r.institution ?? '', r.designation ?? '',
      r.method, r.status, new Date(r.submitted_at).toLocaleString()
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${selectedSessionId?.slice(0,8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (authLoading || loading) return <div className="p-6">Loading…</div>
  if (!event) return <div className="p-6">Event not found.</div>

  const checkInLink = qrToken ? `${window.location.origin}/attend?token=${qrToken.token}` : null

  return (
    <div>
      {/* Back link */}
      <Link href="/admin/events" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← Back to events
      </Link>

      <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
        <div className="text-sm text-gray-500 mt-2 space-x-4">
          <span>{event.event_date} · {event.start_time?.slice(0,5)}{event.end_time ? ` - ${event.end_time.slice(0,5)}` : ''}</span>
          <span>{event.location}</span>
        </div>
        {event.description && <p className="text-sm text-gray-600 mt-3">{event.description}</p>}
        <div className="mt-3">
          <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
            event.status === 'upcoming' ? 'bg-blue-100 text-blue-700' :
            event.status === 'active' ? 'bg-green-100 text-green-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {event.status}
          </span>
        </div>
      </div>

      {/* Sessions section */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sessions</h2>
          <button
            onClick={handleCreateSession}
            disabled={creatingSession}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {creatingSession ? 'Creating…' : '+ New Session'}
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No sessions yet. Create one to start attendance.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => (
              <div
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  selectedSessionId === session.id
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-800">{session.name}</p>
                    <p className="text-xs text-gray-500">
                      Status: {session.status} · Created: {new Date(session.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {session.status !== 'ended' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEndSession(session.id); }}
                        className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200"
                      >
                        End
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedSessionId && (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-md font-semibold mb-3">Session Tools</h3>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              {checkInLink ? (
                <div className="flex items-center gap-3">
                  <QRCodeSVG value={checkInLink} size={120} />
                  <div>
                    <input
                      readOnly
                      value={checkInLink}
                      className="text-xs bg-gray-50 border rounded-lg px-2 py-1 w-64"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(checkInLink)}
                      className="mt-1 text-xs text-indigo-600 hover:underline"
                    >
                      Copy link
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGenerateQR}
                  disabled={generatingQR}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generatingQR ? 'Generating…' : 'Generate QR Code'}
                </button>
              )}
            </div>

            {/* Attendance list */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium">Attendance ({attendance.length})</h4>
                <button onClick={exportCSV} className="text-xs text-indigo-600 hover:underline">
                  Export CSV
                </button>
              </div>
              {attendance.length === 0 ? (
                <p className="text-sm text-gray-400">No check‑ins yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left">Name</th>
                        <th className="px-2 py-2 text-left">Phone</th>
                        <th className="px-2 py-2 text-left">Email</th>
                        <th className="px-2 py-2 text-left">Institution</th>
                        <th className="px-2 py-2 text-left">Method</th>
                        <th className="px-2 py-2 text-left">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map(r => (
                        <tr key={r.id} className="border-t">
                          <td className="px-2 py-2">{r.full_name}</td>
                          <td className="px-2 py-2">{r.phone}</td>
                          <td className="px-2 py-2">{r.email ?? '—'}</td>
                          <td className="px-2 py-2">{r.institution ?? '—'}</td>
                          <td className="px-2 py-2">{r.method}</td>
                          <td className="px-2 py-2">{new Date(r.submitted_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Snapshots (paper upload) section */}
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-3">Paper Attendance Snapshots</h2>
        <div className="flex items-center gap-4 mb-4">
          <label className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 cursor-pointer">
            {uploading ? 'Uploading…' : 'Add Image / Scan'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>
        {attachments.length === 0 ? (
          <p className="text-sm text-gray-400">No paper attendance images uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {attachments.map(file => (
              <a
                key={file.id}
                href={file.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="border rounded-lg p-2 hover:bg-gray-50 flex flex-col items-center"
              >
                <img src={file.file_url} alt={file.file_name} className="h-20 w-full object-cover rounded-md mb-1" />
                <span className="text-xs text-gray-700 truncate w-full text-center">{file.file_name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}