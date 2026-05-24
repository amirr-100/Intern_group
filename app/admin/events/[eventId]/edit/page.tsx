'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface EventForm {
  name: string
  location: string
  event_date: string
  start_time: string
  end_time: string
  description: string
}

export default function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const router = useRouter()
  const [form, setForm] = useState<EventForm>({
    name: '', location: '', event_date: '', start_time: '', end_time: '', description: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('events')
        .select('name, location, event_date, start_time, end_time, description')
        .eq('id', eventId)
        .single()

      if (fetchError || !data) { setNotFound(true); setLoading(false); return }

      setForm({
        name: data.name ?? '',
        location: data.location ?? '',
        event_date: data.event_date ?? '',
        start_time: (data.start_time ?? '').slice(0, 5),
        end_time: (data.end_time ?? '').slice(0, 5),
        description: data.description ?? '',
      })
      setLoading(false)
    }
    load()
  }, [eventId])

  const update = (field: keyof EventForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    setError('')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.location.trim() || !form.event_date || !form.start_time) {
      setError('Name, location, date, and start time are required.')
      return
    }
    setSaving(true)
    const { error: saveError } = await supabase
      .from('events')
      .update({
        name: form.name.trim(),
        location: form.location.trim(),
        event_date: form.event_date,
        start_time: form.start_time,
        end_time: form.end_time || null,
        description: form.description.trim() || null,
      })
      .eq('id', eventId)

    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    router.push(`/admin/events/${eventId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading event…
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 text-sm">Event not found or you do not have access.</p>
        <Link href="/admin/events" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Back to events
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/events/${eventId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to event
      </Link>

      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Edit event</h1>
        <p className="text-sm text-gray-500 mt-1">Changes are saved immediately.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Event name <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)}
              required placeholder="e.g. Sunday Service, Annual Workshop"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition" />
          </div>

          {/* Date + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Date <span className="text-red-500">*</span>
              </label>
              <input type="date" value={form.event_date} onChange={(e) => update('event_date', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Location <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.location} onChange={(e) => update('location', e.target.value)}
                required placeholder="e.g. Main Hall"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition" />
            </div>
          </div>

          {/* Start + End time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Start time <span className="text-red-500">*</span>
              </label>
              <input type="time" value={form.start_time} onChange={(e) => update('start_time', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End time</label>
              <input type="time" value={form.end_time} onChange={(e) => update('end_time', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={form.description} onChange={(e) => update('description', e.target.value)}
              rows={3} placeholder="Optional notes about the event…"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition resize-y" />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 active:scale-[0.99] transition-all disabled:opacity-50 shadow-sm">
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </span>
              ) : 'Save changes'}
            </button>
            <Link href={`/admin/events/${eventId}`}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}