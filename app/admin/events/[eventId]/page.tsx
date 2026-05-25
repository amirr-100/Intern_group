'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import Link from 'next/link'

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
  created_at: string
}

interface AttendanceRecord {
  id: string
  full_name: string
  phone: string
  email: string | null
  institution: string | null
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

const STATUS_PILL: Record<string, string> = {
  upcoming:  'bg-blue-100 text-blue-700',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  archived:  'bg-gray-100 text-gray-600',
}

const SESSION_STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  active:    'bg-green-100 text-green-700',
  ended:     'bg-gray-100 text-gray-500',
}

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [event, setEvent]               = useState<Event | null>(null)
  const [sessions, setSessions]         = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [attendance, setAttendance]     = useState<AttendanceRecord[]>([])
  const [attachments, setAttachments]   = useState<EventAttachment[]>([])
  const [loading, setLoading]           = useState(true)
  const [creatingSession, setCreatingSession] = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchEvent = useCallback(async () => {
    const { data: ev, error } = await supabase
      .from('events').select('*').eq('id', eventId).single()
    if (error || !ev) { router.push('/admin/events'); return }
    setEvent(ev as Event)

    const { data: sess } = await supabase
      .from('sessions').select('*').eq('event_id', eventId).order('created_at', { ascending: true })
    setSessions((sess as Session[]) ?? [])
    setLoading(false)
  }, [eventId, router])

  const fetchAttendance = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('attendance_records').select('*').eq('session_id', sessionId)
      .order('submitted_at', { ascending: false })
    setAttendance((data as AttendanceRecord[]) ?? [])
  }, [])

  const fetchAttachments = useCallback(async () => {
    const { data } = await supabase
      .from('event_attachments').select('*').eq('event_id', eventId)
      .order('created_at', { ascending: false })
    setAttachments((data as EventAttachment[]) ?? [])
  }, [eventId])

  useEffect(() => {
    if (!profile || !eventId) return
    const run = async () => { await fetchEvent(); await fetchAttachments() }
    run()
  }, [eventId, profile, fetchEvent, fetchAttachments])

  useEffect(() => {
    if (!selectedSessionId) return
    const loadAttendance = async () => {
      await fetchAttendance(selectedSessionId)
    }
    void loadAttendance()
  }, [selectedSessionId, fetchAttendance])

  // Real-time attendance updates for selected session
  useEffect(() => {
    if (!selectedSessionId) return
    const channel = supabase
      .channel(`event-attendance-${selectedSessionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'attendance_records',
        filter: `session_id=eq.${selectedSessionId}`,
      }, payload => {
        setAttendance(prev => [payload.new as AttendanceRecord, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedSessionId])

  const handleCreateSession = async () => {
    setCreatingSession(true)
    try {
      const { error } = await supabase.from('sessions').insert({
        event_id: eventId,
        name: `Session ${sessions.length + 1}`,
        status: 'scheduled',
        qr_refresh_interval: 10,
        created_by: profile!.id,
      })
      if (error) throw error
      await fetchEvent()
    } catch {
      alert('Failed to create session')
    } finally {
      setCreatingSession(false)
    }
  }

  const handleEndSession = async (sessionId: string) => {
    await supabase.from('qr_tokens').update({ is_active: false }).eq('session_id', sessionId).eq('is_active', true)
    await supabase.from('sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sessionId)
    await fetchEvent()
    if (selectedSessionId === sessionId) setSelectedSessionId(null)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError('')

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()
      const fileName = `${eventId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

      const { error: storageError } = await supabase.storage
        .from('event-attachments')
        .upload(fileName, file, { upsert: false })

      if (storageError) {
        setUploadError(`Upload failed: ${storageError.message}`)
        setUploading(false)
        // Reset input so same file can be retried
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      const { data: urlData } = supabase.storage
        .from('event-attachments')
        .getPublicUrl(fileName)

      const { error: insertError } = await supabase.from('event_attachments').insert({
        event_id: eventId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        uploaded_by: profile!.id,
      })

      if (insertError) {
        setUploadError(`Save failed: ${insertError.message}`)
        setUploading(false)
        return
      }
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await fetchAttachments()
  }

  const exportCSV = () => {
    if (attendance.length === 0) return
    const header = ['Name', 'Phone', 'Email', 'Institution', 'Method', 'Status', 'Time']
    const rows = attendance.map(r => [
      r.full_name, r.phone, r.email ?? '', r.institution ?? '',
      r.method, r.status, new Date(r.submitted_at).toLocaleString(),
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${selectedSessionId?.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Loading event…
      </div>
    )
  }

  if (!event) return null

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Link href="/admin/events"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
        </svg>
        Back to events
      </Link>

      {/* Event header card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                {event.event_date}
              </span>
              <span>·</span>
              <span>{event.start_time?.slice(0,5)}{event.end_time ? ` – ${event.end_time.slice(0,5)}` : ''}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0L6.343 16.657a8 8 0 1111.314 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                {event.location}
              </span>
            </div>
            {event.description && (
              <p className="text-sm text-gray-500 mt-2">{event.description}</p>
            )}
          </div>
          <span className={`self-start text-xs font-semibold px-3 py-1 rounded-full ${STATUS_PILL[event.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {event.status}
          </span>
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Sessions</h2>
            <p className="text-xs text-gray-500 mt-0.5">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={handleCreateSession} disabled={creatingSession}
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50">
            {creatingSession
              ? <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Creating…</>
              : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>New Session</>}
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600">No sessions yet</p>
            <p className="text-xs text-gray-400 mt-1">Create a session to start collecting attendance.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sessions.map(session => {
              const isSelected = selectedSessionId === session.id
              return (
                <div key={session.id}
                  onClick={() => setSelectedSessionId(isSelected ? null : session.id)}
                  className={`px-5 sm:px-6 py-4 cursor-pointer transition ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        session.status === 'active' ? 'bg-green-500 animate-pulse' :
                        session.status === 'ended'  ? 'bg-gray-300' : 'bg-blue-400'
                      }`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{session.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Created {new Date(session.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${SESSION_STATUS_PILL[session.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {session.status}
                      </span>
                      {session.status === 'scheduled' && (
                        <Link href={`/admin/events/${eventId}/sessions/${session.id}`}
                          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition font-medium">
                          Start
                        </Link>
                      )}
                      {session.status === 'active' && (
                        <>
                          <Link href={`/admin/events/${eventId}/sessions/${session.id}`}
                            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition font-medium">
                            Manage
                          </Link>
                          <button onClick={() => handleEndSession(session.id)}
                            className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 transition font-medium">
                            End
                          </button>
                        </>
                      )}
                      {session.status === 'ended' && (
                        <Link href={`/admin/events/${eventId}/sessions/${session.id}/attendance`}
                          className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition font-medium">
                          Records
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Expandable attendance preview */}
                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-indigo-100" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-gray-800">
                          Attendance
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            ({attendance.length} record{attendance.length !== 1 ? 's' : ''})
                          </span>
                        </p>
                        <div className="flex gap-2">
                          <Link href={`/admin/events/${eventId}/sessions/${session.id}/attendance`}
                            className="text-xs text-indigo-600 hover:underline font-medium">
                            View all →
                          </Link>
                          {attendance.length > 0 && (
                            <button onClick={exportCSV} className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
                              Export CSV
                            </button>
                          )}
                        </div>
                      </div>

                      {attendance.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                          <p className="text-xs">No check-ins yet. Updates appear here in real-time.</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {attendance.slice(0, 10).map(r => (
                            <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-xl border border-gray-100">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                                  {r.full_name[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-gray-900 truncate">{r.full_name}</p>
                                  <p className="text-xs text-gray-400">{r.phone}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                  r.status === 'verified'  ? 'bg-green-100 text-green-700' :
                                  r.status === 'duplicate' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{r.status}</span>
                                <span className="text-xs text-gray-400 hidden sm:block">
                                  {new Date(r.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          ))}
                          {attendance.length > 10 && (
                            <p className="text-xs text-center text-gray-400 pt-1">
                              +{attendance.length - 10} more —{' '}
                              <Link href={`/admin/events/${eventId}/sessions/${session.id}/attendance`} className="text-indigo-600 hover:underline">
                                view all
                              </Link>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Paper Attendance Snapshots */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Paper Attendance Snapshots</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload photos of physical sign-in sheets</p>
          </div>
          <label className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
            uploading ? 'bg-gray-100 text-gray-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}>
            {uploading ? (
              <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>Uploading…</>
            ) : (
              <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>Add Image / Scan</>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>

        {uploadError && (
          <div className="mx-5 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>{uploadError}</span>
            <button onClick={() => setUploadError('')} className="ml-auto shrink-0 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        <div className="p-5 sm:p-6">
          {attachments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <p className="text-sm font-medium text-gray-500">No images uploaded yet</p>
              <p className="text-xs text-gray-400 mt-1">Use the button above to add paper attendance photos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {attachments.map(file => (
                <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer"
                  className="group border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-300 hover:shadow-md transition">
                  <div className="aspect-square bg-gray-100 relative overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.file_url}
                      alt={file.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-xs text-gray-600 truncate">{file.file_name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(file.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}