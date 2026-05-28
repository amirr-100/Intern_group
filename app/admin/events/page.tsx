//context: app/admin/events/page.tsx
'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface EventRow {
  id: string
  name: string
  location: string
  event_date: string
  start_time: string
  end_time: string | null
  status: 'upcoming' | 'active' | 'completed' | 'archived'
  is_archived: boolean
  created_by: string
  // joined — only present in super_admin query
  profiles?: { full_name: string | null; email: string } | null
}

const STATUS_STYLES: Record<string, string> = {
  upcoming:  'bg-blue-100 text-blue-700',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  archived:  'bg-gray-200 text-gray-600',
}

function statusDot(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-500', upcoming: 'bg-blue-400', completed: 'bg-purple-400', archived: 'bg-gray-400',
  }
  return map[status] ?? 'bg-gray-400'
}

export default function EventsListPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const superAdmin = profile?.role === 'super_admin'
      setIsSuperAdmin(superAdmin)

      // RLS already filters for admins — super admin sees all via sa_read_all_events policy
      const { data } = await supabase
        .from('events')
        .select('id, name, location, event_date, start_time, end_time, status, is_archived, created_by')
        .order('event_date', { ascending: false })

      const { data: profilesData } = superAdmin
        ? await supabase.from('profiles').select('id, full_name, email')
        : { data: null }

      // Auto-archive events whose date has passed
      const today = new Date().toISOString().split('T')[0]
      // Merge profiles into events for super admin view
      const merged = ((data as unknown as EventRow[]) ?? []).map(e => ({
        ...e,
        profiles: profilesData?.find(p => p.id === e.created_by) ?? null,
      }))

      const toArchive = merged
        .filter(e => e.event_date < today && e.status !== 'archived' && e.status !== 'completed')
        .map(e => e.id)

      if (toArchive.length > 0) {
        await supabase
          .from('events')
          .update({ status: 'archived' })
          .in('id', toArchive)

        // Re-fetch after archiving
        const { data: refreshed } = await supabase
          .from('events')
          .select('id, name, location, event_date, start_time, end_time, status, is_archived, created_by')
          .order('event_date', { ascending: false })

        const remerged = ((refreshed as unknown as EventRow[]) ?? []).map(e => ({
          ...e,
          profiles: profilesData?.find(p => p.id === e.created_by) ?? null,
        }))
        setEvents(remerged)
      } else {
        setEvents(merged)
      }

      setLoading(false)
    }
    load()
  }, [router])

  const filtered = events.filter((e) => {
    const matchStatus = filterStatus === 'all' || e.status === filterStatus
    const matchSearch = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.location.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isSuperAdmin ? 'All events' : 'My events'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isSuperAdmin
              ? 'Viewing events across all admin accounts'
              : 'Events you have created'}
          </p>
        </div>
        <Link href="/admin/events/new"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New event
        </Link>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {['all', 'active', 'upcoming', 'completed', 'archived'].map((s) => (
          <button key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition border ${
              filterStatus === s
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && counts[s] ? (
              <span className={`ml-1.5 ${filterStatus === s ? 'text-indigo-200' : 'text-gray-400'}`}>
                {counts[s]}
              </span>
            ) : null}
          </button>
        ))}
        {/* Search */}
        <div className="ml-auto flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 text-xs text-gray-500 min-w-0 max-w-[200px]">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            className="bg-transparent outline-none w-full placeholder-gray-400 text-gray-700 text-xs" />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading events…
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-2">
            {search || filterStatus !== 'all' ? 'No events match your filters' : 'No events yet'}
          </h3>
          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
            {search || filterStatus !== 'all'
              ? 'Try adjusting your search or status filter.'
              : 'Create your first event to start managing attendance.'}
          </p>
          {!search && filterStatus === 'all' && (
            <Link href="/admin/events/new"
              className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">
              Create first event
            </Link>
          )}
        </div>
      )}

      {/* Desktop table */}
      {!loading && filtered.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map((event) => (
              <Link key={event.id} href={`/admin/events/${event.id}`}
                className="block bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:border-indigo-200 transition">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">{event.name}</h3>
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_STYLES[event.status]}`}>
                    {event.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0L6.343 16.657a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {event.location}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{event.start_time.slice(0, 5)}
                  </div>
                  {isSuperAdmin && event.profiles && (
                    <div className="flex items-center gap-1.5 text-indigo-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {event.profiles.full_name ?? event.profiles.email}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Event</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Location</th>
                  {isSuperAdmin && (
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Created by</th>
                  )}
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(event.status)}`} />
                        <span className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition">
                          {event.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <span className="text-gray-400 ml-1.5">{event.start_time.slice(0, 5)}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 max-w-[180px] truncate">{event.location}</td>
                    {isSuperAdmin && (
                      <td className="px-5 py-4 text-sm text-gray-600">
                        {event.profiles?.full_name ?? event.profiles?.email ?? '—'}
                      </td>
                    )}
                    <td className="px-5 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[event.status]}`}>
                        {event.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/admin/events/${event.id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium opacity-0 group-hover:opacity-100 transition-all">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
