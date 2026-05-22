'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ArchivedEvent {
  id: string
  name: string
  event_date: string
  location: string
  created_at: string
  attachment_count: number
}

interface EventAttachment {
  id: string
  file_name: string
  file_url: string
  file_type: string | null
  created_at: string
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ArchivesPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [archivedEvents, setArchivedEvents] = useState<ArchivedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<ArchivedEvent | null>(null)
  const [attachments, setAttachments] = useState<EventAttachment[]>([])
  const [attachLoading, setAttachLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Auth redirect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !profile) router.push('/login')
  }, [authLoading, profile, router])

  // ── Fetch archived events (stable callback) ────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const isSuperAdmin = profile!.role === 'super_admin'

    let query = supabase
      .from('events')
      .select('id, name, event_date, location, created_at')
      .eq('is_archived', true)
      .order('event_date', { ascending: false })

    if (!isSuperAdmin) query = query.eq('created_by', profile!.id)

    const { data: events } = await query
    const eventsList = (events ?? []) as ArchivedEvent[]

    if (eventsList.length > 0) {
      const eventIds = eventsList.map(e => e.id)
      const { data: counts } = await supabase
        .from('event_attachments')
        .select('event_id')
        .in('event_id', eventIds)

      const countMap: Record<string, number> = {}
      ;(counts ?? []).forEach(row => {
        countMap[row.event_id] = (countMap[row.event_id] ?? 0) + 1
      })

      eventsList.forEach(e => {
        e.attachment_count = countMap[e.id] ?? 0
      })
    }

    setArchivedEvents(eventsList)
    setLoading(false)
  }, [profile])

  // ── Trigger fetch once after profile is ready (stable effect) ──────────────
  useEffect(() => {
    if (!profile) return

    let cancelled = false

    const load = async () => {
      // Set loading true only if not cancelled
      if (!cancelled) setLoading(true)
      await fetchData()
      // fetchData already sets loading false, but we double-check cancellation
      if (cancelled) {
        setLoading(false) // ensure we stop spinner if unmounted mid-fetch
      }
    }

     
    load()

    return () => {
      cancelled = true
    }
  }, [profile, fetchData])

  // ── Open event folder (modal) ──────────────────────────────────────────────
  const openEvent = async (event: ArchivedEvent) => {
    setSelectedEvent(event)
    setAttachLoading(true)
    const { data } = await supabase
      .from('event_attachments')
      .select('id, file_name, file_url, file_type, created_at')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
    setAttachments((data as EventAttachment[]) ?? [])
    setAttachLoading(false)
  }

  // ── Restore event ──────────────────────────────────────────────────────────
  const unarchiveEvent = async (id: string) => {
    await supabase.from('events').update({ is_archived: false }).eq('id', id)
    setArchivedEvents(prev => prev.filter(e => e.id !== id))
    if (selectedEvent?.id === id) setSelectedEvent(null)
  }

  // ── Upload image (camera / file) ──────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedEvent) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const fileName = `${selectedEvent.id}/${Date.now()}_${file.name}`
      const { error: storageError } = await supabase.storage
        .from('event-attachments')
        .upload(fileName, file)

      if (storageError) {
        alert('Upload failed: ' + storageError.message)
        continue
      }

      const { data: publicUrl } = supabase.storage
        .from('event-attachments')
        .getPublicUrl(fileName)

      await supabase.from('event_attachments').insert({
        event_id: selectedEvent.id,
        file_name: file.name,
        file_url: publicUrl.publicUrl,
        file_type: file.type,
        uploaded_by: profile!.id,
      })
    }

    setUploading(false)
    openEvent(selectedEvent)
    fetchData()
  }

  // ── Download CSV for one event ─────────────────────────────────────────────
  const downloadAttendance = async (event: ArchivedEvent) => {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('event_id', event.id)

    if (!sessions?.length) return alert('No sessions found for this event.')

    const sessionIds = sessions.map(s => s.id)
    const { data: records } = await supabase
      .from('attendance_records')
      .select('full_name, phone, email, institution, designation, method, status, submitted_at')
      .in('session_id', sessionIds)
      .order('submitted_at', { ascending: false })

    if (!records?.length) return alert('No attendance records found.')

    const header = ['Name', 'Phone', 'Email', 'Institution', 'Designation', 'Method', 'Status', 'Time']
    const rows = records.map(r => [
      r.full_name, r.phone, r.email ?? '', r.institution ?? '', r.designation ?? '',
      r.method, r.status, new Date(r.submitted_at).toLocaleString()
    ])
    const csv = [header, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${event.name.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <div className="text-center">
          <div className="animate-spin text-3xl mb-3">⏳</div>
          <p className="text-sm">Loading archives…</p>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Archives</h1>
        <p className="text-sm text-gray-500 mt-1">Past events and paper attendance images</p>
      </div>

      {/* Folder grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {archivedEvents.map(event => (
          <button
            key={event.id}
            onClick={() => openEvent(event)}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition text-left group"
          >
            <div className="text-3xl mb-2">📁</div>
            <h3 className="text-sm font-semibold text-gray-800 truncate">{event.name}</h3>
            <p className="text-xs text-gray-500 mt-1">{event.event_date}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">
                {event.attachment_count} file{event.attachment_count !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition">
                Open →
              </span>
            </div>
          </button>
        ))}
        {archivedEvents.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            <p>No archived events found.</p>
          </div>
        )}
      </div>

      {/* ── Modal: Event folder detail ── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl max-h-[80vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedEvent.name}</h2>
                <p className="text-xs text-gray-500">
                  {selectedEvent.event_date} · {selectedEvent.location}
                </p>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Actions bar */}
            <div className="p-4 border-b flex flex-wrap gap-3">
              {/* Upload image (camera) */}
              <label className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
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

              {/* Download CSV */}
              <button
                onClick={() => downloadAttendance(selectedEvent)}
                className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download CSV
              </button>

              {/* Restore event */}
              <button
                onClick={() => unarchiveEvent(selectedEvent.id)}
                className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition ml-auto"
              >
                ↻ Restore
              </button>
            </div>

            {/* Attachments list */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">
                Uploaded images ({attachments.length})
              </h3>
              {attachLoading ? (
                <div className="flex justify-center py-6 text-gray-400">Loading…</div>
              ) : attachments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No paper attendance images yet. Use the button above to add one.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {attachments.map(file => (
                    <a
                      key={file.id}
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border rounded-lg p-3 hover:bg-gray-50 transition flex flex-col items-center text-center"
                    >
                      {file.file_type?.startsWith('image/') ? (
                        <div className="w-full h-24 relative mb-2 rounded-md overflow-hidden">
                          <Image
                            src={file.file_url}
                            alt={file.file_name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-full h-24 bg-gray-100 flex items-center justify-center text-3xl mb-2 rounded-md">
                          📄
                        </div>
                      )}
                      <span className="text-xs text-gray-700 truncate w-full">
                        {file.file_name}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global export */}
      <div className="mt-8">
        <button
          onClick={() => {
            const csv = [
              ['Name', 'Date', 'Location'],
              ...archivedEvents.map(e => [e.name, e.event_date, e.location])
            ]
              .map(row => row.map(v => `"${v}"`).join(','))
              .join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `archived-events-${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
          disabled={archivedEvents.length === 0}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
        >
          📥 Download All Events (CSV)
        </button>
      </div>
    </div>
  )
}