﻿'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import Link from 'next/link'

interface Stats { totalEvents: number; activeSessions: number; totalCheckIns: number; duplicates: number }
interface LiveRecord { id: string; full_name: string; phone: string; method: string; status: string; submitted_at: string; event_id: string }

export default function DashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats]       = useState<Stats>({ totalEvents: 0, activeSessions: 0, totalCheckIns: 0, duplicates: 0 })
  const [live, setLive]         = useState<LiveRecord[]>([])
  const [statsLoading, setStatsLoading] = useState(true)

  const fetchStats = async () => {
    if (!profile) return
    const isSuperAdmin = profile.role === 'super_admin'

    let myEventIds: string[] | null = null
    if (!isSuperAdmin) {
      const { data } = await supabase.from('events').select('id').eq('created_by', profile.id)
      myEventIds = data?.map(e => e.id) ?? []
    }

    const [evRes, sessRes, checkRes, dupRes] = await Promise.all([
      (() => {
        let q = supabase.from('events').select('id', { count: 'exact', head: true }).neq('status', 'archived')
        if (myEventIds) q = q.in('id', myEventIds.length ? myEventIds : ['none'])
        return q
      })(),
      (() => {
        let q = supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'active')
        if (myEventIds) q = q.in('event_id', myEventIds.length ? myEventIds : ['none'])
        return q
      })(),
      (() => {
        let q = supabase.from('attendance_records').select('id', { count: 'exact', head: true })
        if (myEventIds) q = q.in('event_id', myEventIds.length ? myEventIds : ['none'])
        return q
      })(),
      (() => {
        let q = supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('status', 'duplicate')
        if (myEventIds) q = q.in('event_id', myEventIds.length ? myEventIds : ['none'])
        return q
      })(),
    ])

    setStats({
      totalEvents:    evRes.count   ?? 0,
      activeSessions: sessRes.count ?? 0,
      totalCheckIns:  checkRes.count ?? 0,
      duplicates:     dupRes.count  ?? 0,
    })
    setStatsLoading(false)
  }

  const fetchLive = async () => {
    if (!profile) return
    let q = supabase
      .from('attendance_records')
      .select('id, full_name, phone, method, status, submitted_at, event_id')
      .order('submitted_at', { ascending: false })
      .limit(8)

    if (profile.role !== 'super_admin') {
      const { data } = await supabase.from('events').select('id').eq('created_by', profile.id)
      const ids = data?.map(e => e.id) ?? []
      if (ids.length === 0) { setLive([]); return }
      q = q.in('event_id', ids)
    }
    const { data } = await q
    setLive((data as LiveRecord[]) ?? [])
  }

  useEffect(() => {
    if (!profile) return
    const run = async () => {
      await Promise.all([fetchStats(), fetchLive()])
    }
    run()

    const ch = supabase.channel('dash-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_records' }, payload => {
        setLive(prev => [payload.new as LiveRecord, ...prev].slice(0, 8))
        fetchStats()
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [profile])

  const statCards = [
    { label: 'Total Events',    value: stats.totalEvents,    icon: '📅', color: 'bg-blue-50 text-blue-600 border-blue-100' },
    { label: 'Active Sessions', value: stats.activeSessions, icon: '🟢', color: 'bg-green-50 text-green-600 border-green-100' },
    { label: 'Total Check-ins', value: stats.totalCheckIns,  icon: '✅', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
    { label: 'Duplicates',      value: stats.duplicates,     icon: '⚠️', color: 'bg-red-50 text-red-600 border-red-100' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'Admin'} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">Here&apos;s what&apos;s happening with your events today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{s.label}</p>
                <p className="text-3xl font-bold text-gray-900">{statsLoading ? '…' : s.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border ${s.color}`}>
                {s.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live feed */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Live Check-ins</h2>
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Live
            </span>
          </div>
          {live.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">No check-ins yet. Start a session to begin.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {live.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {r.full_name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.full_name}</p>
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
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Quick Actions</h2>
          {[
            { href: '/admin/events/new', icon: '➕', label: 'Create Event',    desc: 'Set up a new event',           color: 'bg-indigo-50 text-indigo-600' },
            { href: '/admin/events',     icon: '📅', label: 'My Events',       desc: 'View and manage events',       color: 'bg-blue-50 text-blue-600' },
            { href: '/admin/sessions',   icon: '🔗', label: 'Sessions',        desc: 'Start or manage sessions',     color: 'bg-green-50 text-green-600' },
            { href: '/admin/analytics',  icon: '📈', label: 'Analytics',       desc: 'View detailed insights',       color: 'bg-purple-50 text-purple-600' },
          ].map(a => (
            <Link key={a.href} href={a.href}
              className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-indigo-200 hover:shadow-md transition group">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${a.color}`}>{a.icon}</div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 transition">{a.label}</p>
                <p className="text-xs text-gray-400">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}