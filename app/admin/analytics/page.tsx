// app/admin/analytics/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────
interface Stats {
  totalAttendance: number
  uniqueAttendees: number
  avgPerEvent: number
  duplicateRate: number
}

interface WeeklyData {
  day: string
  count: number
}

interface EventBreakdown {
  name: string
  count: number
}

interface MethodBreakdown {
  method: string
  count: number
  pct: number
}

interface DuplicateInsights {
  totalFlagged: number
}

// ── Helper: simple bar ──────────────────────────────────
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  )
}

export default function AnalyticsPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [stats, setStats] = useState<Stats | null>(null)
  const [weekly, setWeekly] = useState<WeeklyData[]>([])
  const [eventBreakdown, setEventBreakdown] = useState<EventBreakdown[]>([])
  const [methodBreakdown, setMethodBreakdown] = useState<MethodBreakdown[]>([])
  const [duplicateInsights, setDuplicateInsights] = useState<DuplicateInsights>({ totalFlagged: 0 })
  const [loading, setLoading] = useState(true)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login')
    }
  }, [authLoading, profile, router])

  useEffect(() => {
    if (!profile) return

    const fetchAnalytics = async () => {
      setLoading(true)

      // 1. Total attendance & unique attendees
      const { count: totalAttendance, data: uniqueData } = await supabase
        .from('attendance_records')
        .select('phone', { count: 'exact' })

      const uniquePhones = new Set(uniqueData?.map(r => r.phone) || [])
      const uniqueAttendees = uniquePhones.size

      // 2. Number of events (for avg per event)
      const { count: eventCount } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })

      const avgPerEvent = eventCount ? Math.round(totalAttendance! / eventCount) : 0

      // 3. Duplicate rate
      const { count: duplicateCount } = await supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'duplicate')

      const duplicateRate = totalAttendance
        ? Math.round((duplicateCount! / totalAttendance) * 1000) / 10 // one decimal
        : 0

      setStats({
        totalAttendance: totalAttendance || 0,
        uniqueAttendees,
        avgPerEvent,
        duplicateRate,
      })

      // 4. Weekly attendance (last 7 days)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      const { data: weeklyData } = await supabase
        .from('attendance_records')
        .select('submitted_at')
        .gte('submitted_at', sevenDaysAgo.toISOString())

      const daysMap: Record<string, number> = {}
      weeklyData?.forEach(r => {
        const date = new Date(r.submitted_at).toLocaleDateString('en-US', { weekday: 'short' })
        daysMap[date] = (daysMap[date] || 0) + 1
      })
      const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const today = new Date()
      const todayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1 // make Monday=0
      const orderedDays = weekDays.map((_, i) => {
        const idx = (todayIndex - 6 + i + 7) % 7
        return weekDays[idx]
      })
      const weeklyArray = orderedDays.map(day => ({
        day,
        count: daysMap[day] || 0,
      }))
      setWeekly(weeklyArray)

      // 5. Attendance by event
      const { data: eventData } = await supabase
        .from('attendance_records')
        .select('event_id, events!inner(name)')
        .order('event_id')

      const eventMap: Record<string, { name: string; count: number }> = {}
      eventData?.forEach(r => {
        const name = (r.events as any)?.name || 'Unknown'
        if (!eventMap[name]) eventMap[name] = { name, count: 0 }
        eventMap[name].count++
      })
      const eventArray = Object.values(eventMap).sort((a, b) => b.count - a.count)
      setEventBreakdown(eventArray)

      // 6. Method breakdown
      const { data: methodData } = await supabase
        .from('attendance_records')
        .select('method')

      const methodCounts: Record<string, number> = {}
      methodData?.forEach(r => {
        methodCounts[r.method] = (methodCounts[r.method] || 0) + 1
      })
      const totalMethods = Object.values(methodCounts).reduce((a, b) => a + b, 0)
      const methodArray: MethodBreakdown[] = Object.entries(methodCounts)
        .map(([method, count]) => ({
          method: method === 'qr_scan' ? 'QR Scan' : method === 'manual' ? 'Manual' : 'Paper Upload',
          count,
          pct: totalMethods ? Math.round((count / totalMethods) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count)
      setMethodBreakdown(methodArray)

      // 7. Duplicate insights
      setDuplicateInsights({ totalFlagged: duplicateCount || 0 })

      setLoading(false)
    }

    fetchAnalytics()
  }, [profile])

  if (authLoading || loading) {
    return <div className="text-center py-16 text-gray-400">Loading analytics…</div>
  }

  if (!stats) {
    return <div className="text-center py-16 text-gray-400">No data available.</div>
  }

  const colorPalette = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500']

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Real‑time attendance insights</p>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Attendance', value: stats.totalAttendance, icon: '✅' },
          { label: 'Unique Attendees', value: stats.uniqueAttendees, icon: '👤' },
          { label: 'Avg per Event', value: stats.avgPerEvent, icon: '📊' },
          { label: 'Duplicate Rate', value: `${stats.duplicateRate}%`, icon: '⚠️' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl shadow-md border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1">{s.label}</p>
                <p className="text-2xl font-bold text-gray-800">{s.value}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Weekly bar chart */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Last 7 Days</h3>
          <div className="flex items-end justify-between h-40 gap-2">
            {weekly.map((d) => {
              const maxCount = Math.max(...weekly.map(d => d.count), 1)
              const height = Math.round((d.count / maxCount) * 100)
              return (
                <div key={d.day} className="flex flex-col items-center flex-1">
                  <div className="w-full bg-indigo-100 rounded-t-lg relative" style={{ height: `${height}%` }}>
                    <div className="absolute inset-0 bg-indigo-500 rounded-t-lg opacity-80" />
                  </div>
                  <span className="text-xs text-gray-500 mt-2">{d.day}</span>
                  <span className="text-xs font-medium text-gray-700">{d.count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Attendance by event */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Attendance by Event</h3>
          <div className="space-y-4">
            {eventBreakdown.slice(0, 5).map((event, i) => (
              <div key={event.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{event.name}</span>
                  <span className="font-medium text-gray-800">{event.count}</span>
                </div>
                <Bar
                  value={event.count}
                  max={Math.max(...eventBreakdown.map(e => e.count), 1)}
                  color={colorPalette[i % colorPalette.length]}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: method breakdown + duplicates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Method breakdown */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Check‑in Method</h3>
          <div className="space-y-4">
            {methodBreakdown.map((item) => (
              <div key={item.method}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{item.method}</span>
                  <span className="font-medium text-gray-800">{item.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-full rounded-full bg-gray-700"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Duplicate insights */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Duplicate Detection</h3>
          <div className="text-center p-6 bg-red-50 rounded-xl mb-4">
            <p className="text-3xl font-bold text-red-600">{duplicateInsights.totalFlagged}</p>
            <p className="text-sm text-red-500 mt-1">Total flagged duplicates</p>
          </div>
          <p className="text-sm text-gray-500">
            The system automatically marks duplicate submissions based on phone or device fingerprint.
          </p>
        </div>
      </div>
    </div>
  )
}