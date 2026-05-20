// app/admin/events/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import type { Event } from '@/types/database'

export default function EventsListPage() {
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .then(({ data }) => setEvents(data || []))
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Events</h1>
          <p>Manage your events and sessions</p>
        </div>
        <Link href="/admin/events/new" className="btn btn-primary">+ New Event</Link>
      </div>
      <div className="events-grid">
        {events.map(event => (
          <Link key={event.id} href={`/admin/events/${event.id}`} className="event-card">
            <div className="event-card-top bg-blue">
              <span className={`badge ${event.status}`}>{event.status}</span>
              <span className="badge">{new Date(event.event_date).toLocaleDateString()}</span>
            </div>
            <div className="event-card-body">
              <h3>{event.name}</h3>
              <p>📍 {event.location}</p>
              <p>🕒 {event.start_time} {event.end_time ? `- ${event.end_time}` : ''}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}