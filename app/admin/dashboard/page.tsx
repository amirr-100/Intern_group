﻿'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Stat {
  label: string
  value: number
  icon: string
  color: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<Stat[]>([
    { label: 'Total Events', value: 0, icon: '📅', color: 'blue' },
    { label: 'Active Sessions', value: 0, icon: '🟢', color: 'green' },
    { label: 'Total Check‑ins', value: 0, icon: '✅', color: 'orange' },
    { label: 'Duplicates', value: 0, icon: '⚠️', color: 'red' },
  ])

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch user profile for name / email
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(profileData)

      // Fetch stats
      const [eventsRes, sessionsRes, attendanceRes, dupsRes] = await Promise.all([
        supabase.from('events').select('id', { count: 'exact' }).eq('created_by', user.id),
        supabase.from('sessions').select('id', { count: 'exact' }).eq('created_by', user.id).eq('status', 'active'),
        supabase.from('attendance_records').select('id', { count: 'exact' }),
        supabase.from('attendance_records').select('id', { count: 'exact' }).eq('status', 'duplicate'),
      ])

      setStats([
        { label: 'Total Events', value: eventsRes.count || 0, icon: '📅', color: 'blue' },
        { label: 'Active Sessions', value: sessionsRes.count || 0, icon: '🟢', color: 'green' },
        { label: 'Total Check‑ins', value: attendanceRes.count || 0, icon: '✅', color: 'orange' },
        { label: 'Duplicates', value: dupsRes.count || 0, icon: '⚠️', color: 'red' },
      ])
    }

    fetchData()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // colour accent classes for the stat cards
  const accentColors: Record<string, string> = {
    blue:   'bg-blue-50 border-blue-200 text-blue-600',
    green:  'bg-green-50 border-green-200 text-green-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
    red:    'bg-red-50 border-red-200 text-red-600',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Welcome back, {profile?.full_name || profile?.email || 'Admin'}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-red-600 hover:text-red-700 hover:underline transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-bold text-gray-800">{stat.value}</p>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border ${accentColors[stat.color] || 'bg-gray-50 border-gray-200 text-gray-500'}`}
                >
                  {stat.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            href="/admin/events/new"
            className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-shadow flex items-center gap-5 group"
          >
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl">
              📅
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 group-hover:text-indigo-700 transition">Create New Event</h3>
              <p className="text-sm text-gray-500 mt-1">Set up an event and start taking attendance</p>
            </div>
          </Link>

          <Link
            href="/admin/events"
            className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-shadow flex items-center gap-5 group"
          >
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center text-2xl">
              📁
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 group-hover:text-indigo-700 transition">Manage Events</h3>
              <p className="text-sm text-gray-500 mt-1">View and edit your events and sessions</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}