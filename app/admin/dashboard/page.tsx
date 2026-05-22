﻿// app/admin/dashboard/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Stats {
  totalEvents: number
  activeSessions: number
  totalCheckIns: number
  duplicates: number
}

export default function DashboardPage() {
  const { profile, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({
    totalEvents: 0,
    activeSessions: 0,
    totalCheckIns: 0,
    duplicates: 0,
  })
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login')
    }
  }, [authLoading, profile, router])

  useEffect(() => {
    if (!profile) return

    const fetchStats = async () => {
      setDataLoading(true)
      const isSuperAdmin = profile.role === 'super_admin'

      // ── Events count ───────────────────────────────────────────
      // Super admin: all events. Admin: only their own.
      let eventsQuery = supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', false)

      if (!isSuperAdmin) {
        eventsQuery = eventsQuery.eq('created_by', profile.id)
      }
      const { count: totalEvents } = await eventsQuery

      // ── Active sessions ────────────────────────────────────────
      let sessionsQuery = supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')

      if (!isSuperAdmin) {
        sessionsQuery = sessionsQuery.eq('created_by', profile.id)
      }
      const { count: activeSessions } = await sessionsQuery

      // ── Total check-ins (from attendees table) ─────────────────
      // Admin: only attendees for their events
      let attendeesQuery = supabase
        .from('attendees')
        .select('id', { count: 'exact', head: true })

      if (!isSuperAdmin) {
        // Get event IDs that belong to this admin first
        const { data: myEvents } = await supabase
          .from('events')
          .select('id')
          .eq('created_by', profile.id)

        const myEventIds = myEvents?.map((e) => e.id) ?? []
        if (myEventIds.length > 0) {
          attendeesQuery = attendeesQuery.in('event_id', myEventIds)
        } else {
          // No events → 0 check-ins
          setStats({
            totalEvents: totalEvents ?? 0,
            activeSessions: activeSessions ?? 0,
            totalCheckIns: 0,
            duplicates: 0,
          })
          setDataLoading(false)
          return
        }
      }
      const { count: totalCheckIns } = await attendeesQuery

      // ── Duplicate count ────────────────────────────────────────
      // A duplicate = same phone appearing more than once in the same session.
      // Simple proxy: count rows where the phone appears duplicated.
      // Using a "count group" approach via RPC or just showing 0 until you add
      // a `is_duplicate` column. For now we leave it as 0 unless you track it.
      const duplicates = 0

      setStats({
        totalEvents: totalEvents ?? 0,
        activeSessions: activeSessions ?? 0,
        totalCheckIns: totalCheckIns ?? 0,
        duplicates,
      })
      setDataLoading(false)
    }

    fetchStats()
  }, [profile])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="animate-spin text-3xl mb-3">⏳</div>
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  const statCards = [
    {
      label: 'Total Events',
      value: dataLoading ? '…' : stats.totalEvents,
      icon: '📅',
      accent: 'bg-blue-50 border-blue-100 text-blue-600',
    },
    {
      label: 'Active Sessions',
      value: dataLoading ? '…' : stats.activeSessions,
      icon: '🟢',
      accent: 'bg-green-50 border-green-100 text-green-600',
    },
    {
      label: 'Total Check‑ins',
      value: dataLoading ? '…' : stats.totalCheckIns,
      icon: '✅',
      accent: 'bg-orange-50 border-orange-100 text-orange-600',
    },
    {
      label: 'Duplicates',
      value: dataLoading ? '…' : stats.duplicates,
      icon: '⚠️',
      accent: 'bg-red-50 border-red-100 text-red-600',
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Welcome back,{' '}
              <span className="font-medium text-gray-700">
                {profile?.full_name || profile?.email || 'Admin'}
              </span>
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-sm text-red-600 hover:text-red-700 hover:underline transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5
                hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">
                    {s.label}
                  </p>
                  <p className="text-3xl font-bold text-gray-800">{s.value}</p>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border ${s.accent}`}
                >
                  {s.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Link
            href="/admin/events/new"
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6
              hover:shadow-md transition-shadow flex items-center gap-5 group"
          >
            <div className="w-13 h-13 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
              📅
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 group-hover:text-indigo-700 transition">
                Create New Event
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Set up an event and start taking attendance
              </p>
            </div>
          </Link>

          <Link
            href="/admin/events"
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6
              hover:shadow-md transition-shadow flex items-center gap-5 group"
          >
            <div className="w-13 h-13 bg-amber-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
              📁
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 group-hover:text-indigo-700 transition">
                Manage Events
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                View and edit your events and sessions
              </p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}