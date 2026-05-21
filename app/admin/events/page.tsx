'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import type { Event } from '@/types/database'

export default function EventsListPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .then(({ data }) => {
        setEvents(data || [])
        setLoading(false)
      })
  }, [])

  // Helper to pick a gradient background for the card top
  const cardGradient = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-gradient-to-r from-green-100 to-emerald-50'
      case 'upcoming':
        return 'bg-gradient-to-r from-blue-100 to-indigo-50'
      case 'completed':
        return 'bg-gradient-to-r from-purple-100 to-violet-50'
      case 'archived':
        return 'bg-gradient-to-r from-gray-100 to-gray-50'
      default:
        return 'bg-gradient-to-r from-indigo-100 to-blue-50'
    }
  }

  // Status badge colour map
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      upcoming: 'bg-blue-100 text-blue-700',
      active: 'bg-green-100 text-green-700',
      completed: 'bg-purple-100 text-purple-700',
      archived: 'bg-gray-200 text-gray-600',
    }
    return map[status] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Events</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your events and sessions</p>
        </div>
        <Link
          href="/admin/events/new"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 hover:shadow-indigo-300/50"
        >
          <span className="text-lg">+</span> New Event
        </Link>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-16 text-gray-400">Loading events…</div>
      )}

      {/* Empty state */}
      {!loading && events.length === 0 && (
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-4">📅</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No events yet</h3>
          <p className="text-gray-500 mb-6">Create your first event to start managing attendance.</p>
          <Link
            href="/admin/events/new"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition"
          >
            + Create Event
          </Link>
        </div>
      )}

      {/* Events grid */}
      {!loading && events.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/admin/events/${event.id}`}
              className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group"
            >
              {/* Card top – gradient */}
              <div className={`px-5 py-4 flex items-center justify-between ${cardGradient(event.status)}`}>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge(event.status)}`}>
                  {event.status}
                </span>
                <span className="text-xs text-gray-600 font-medium">
                  {new Date(event.event_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>

              {/* Card body */}
              <div className="p-5">
                <h3 className="font-semibold text-gray-800 group-hover:text-indigo-700 transition mb-3">
                  {event.name}
                </h3>
                <div className="space-y-1.5 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>📍</span> {event.location}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🕒</span> {event.start_time}
                    {event.end_time && ` – ${event.end_time}`}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}