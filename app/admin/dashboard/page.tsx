'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Stat {
  label: string
  value: number
  icon: string
  color: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stat[]>([
    { label: 'Total Events', value: 0, icon: '📅', color: 'blue' },
    { label: 'Active Sessions', value: 0, icon: '🟢', color: 'green' },
    { label: 'Total Check‑ins', value: 0, icon: '✅', color: 'orange' },
    { label: 'Duplicates', value: 0, icon: '⚠️', color: 'red' },
  ])

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [eventsRes, sessionsRes, attendanceRes, dupsRes] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact' }).eq('created_by', user.id),
        supabase.from('sessions').select('id', { count: 'exact' }).eq('created_by', user.id).eq('status', 'active'),
        supabase.from('attendance_records').select('id', { count: 'exact' }),
        supabase.from('attendance_records').select('id', { count: 'exact' }).eq('status', 'duplicate'),
      ])
      setStats([
        { ...stats[0], value: eventsRes.count || 0 },
        { ...stats[1], value: sessionsRes.count || 0 },
        { ...stats[2], value: attendanceRes.count || 0 },
        { ...stats[3], value: dupsRes.count || 0 },
      ])
    }
    fetchStats()
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Quick overview of your attendance system</p>
        </div>
        <Link href="/admin/events/new" className="btn btn-primary">+ New Event</Link>
      </div>
      <div className="stats-grid">
        {stats.map(stat => (
          <div key={stat.label} className="stat-card">
            <div>
              <h3>{stat.label}</h3>
              <h2>{stat.value}</h2>
            </div>
            <div className={`stat-icon ${stat.color}`}>{stat.icon}</div>
          </div>
        ))}
      </div>
    </div>
  )
}