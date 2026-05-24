'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

interface OverviewStats {
  totalAttendance: number
  uniqueAttendees: number
  avgPerEvent: number
  duplicateRate: number
}
interface DayCount { day: string; count: number }
interface EventCount { name: string; count: number }
interface MethodCount { label: string; count: number; pct: number }

function Bar({ pct, colorClass }: { pct: number; colorClass: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full ${colorClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

const METHOD_LABELS: Record<string, string> = {
  qr_scan: 'QR Scan', manual: 'Manual Entry', paper_upload: 'Paper Upload',
}
const METHOD_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500']
const EVENT_COLORS  = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500']

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildWeekFromMap(dayMap: Record<string, number>): DayCount[] {
  const today = new Date().getDay()
  return Array.from({ length: 7 }, (_, i) => {
    const label = DAY_SHORT[(today - 6 + i + 7) % 7]
    return { day: label, count: dayMap[label] ?? 0 }
  })
}

export default function AnalyticsPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [overview, setOverview]   = useState<OverviewStats | null>(null)
  const [weekly, setWeekly]       = useState<DayCount[]>(buildWeekFromMap({}))
  const [byEvent, setByEvent]     = useState<EventCount[]>([])
  const [byMethod, setByMethod]   = useState<MethodCount[]>([])
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (!authLoading && !profile) router.push('/login')
  }, [authLoading, profile, router])

  const fetchAnalytics = useCallback(async () => {
    if (!profile) return
    const isSuperAdmin = profile.role === 'super_admin'

    // Get scoped event IDs for non-super-admin
    let scopedEventIds: string[] | null = null
    if (!isSuperAdmin) {
      const { data: myEvents } = await supabase
        .from('events').select('id').eq('created_by', profile.id)
      scopedEventIds = myEvents?.map(e => e.id) ?? []
      if (scopedEventIds.length === 0) {
        setOverview({ totalAttendance: 0, uniqueAttendees: 0, avgPerEvent: 0, duplicateRate: 0 })
        setWeekly(buildWeekFromMap({}))
        setByEvent([])
        setByMethod([])
        setLoading(false)
        return
      }
    }

    // Fetch all attendance records in scope
    let recQuery = supabase
      .from('attendance_records')
      .select('id, full_name, phone, method, status, submitted_at, session_id, event_id')

    if (scopedEventIds) recQuery = recQuery.in('event_id', scopedEventIds)

    const { data: records } = await recQuery
    const all = records ?? []

    // Overview
    const totalAttendance = all.length
    const uniquePhones = new Set(all.map(r => r.phone)).size
    const duplicates = all.filter(r => r.status === 'duplicate').length
    const duplicateRate = totalAttendance > 0 ? Math.round((duplicates / totalAttendance) * 100) : 0

    // Event count for avg
    let evCountQuery = supabase.from('events').select('id', { count: 'exact', head: true })
    if (scopedEventIds) evCountQuery = evCountQuery.in('id', scopedEventIds)
    const { count: evCount } = await evCountQuery
    const avgPerEvent = (evCount ?? 0) > 0 ? Math.round(totalAttendance / (evCount ?? 1)) : 0

    setOverview({ totalAttendance, uniqueAttendees: uniquePhones, avgPerEvent, duplicateRate })

    // Weekly
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)
    const dayMap: Record<string, number> = {}
    all.filter(r => new Date(r.submitted_at) >= sevenDaysAgo).forEach(r => {
      const label = new Date(r.submitted_at).toLocaleDateString('en-US', { weekday: 'short' })
      dayMap[label] = (dayMap[label] ?? 0) + 1
    })
    setWeekly(buildWeekFromMap(dayMap))

    // By event
    const eventsRes = scopedEventIds
      ? await supabase.from('events').select('id, name').in('id', scopedEventIds)
      : await supabase.from('events').select('id, name')
    const eventNameMap: Record<string, string> = {}
    eventsRes.data?.forEach(e => { eventNameMap[e.id] = e.name })

    const eventCountMap: Record<string, number> = {}
    all.forEach(r => {
      const name = eventNameMap[r.event_id] ?? 'Unknown'
      eventCountMap[name] = (eventCountMap[name] ?? 0) + 1
    })
    setByEvent(Object.entries(eventCountMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))

    // By method
    const methodMap: Record<string, number> = {}
    all.forEach(r => { methodMap[r.method] = (methodMap[r.method] ?? 0) + 1 })
    setByMethod(
      Object.entries(methodMap)
        .map(([method, count]) => ({
          label: METHOD_LABELS[method] ?? method,
          count,
          pct: totalAttendance > 0 ? Math.round((count / totalAttendance) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count)
    )

    setLastUpdated(new Date())
    setLoading(false)
  }, [profile])

  // Initial fetch
  useEffect(() => {
    if (!profile) return
    const run = async () => { await fetchAnalytics() }
    run()
  }, [profile, fetchAnalytics])

  // Real-time subscription — re-fetch whenever a new attendance record is inserted
  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel('analytics-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance_records',
      }, () => {
        fetchAnalytics()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, fetchAnalytics])

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <div className="text-center">
          <div className="animate-spin text-3xl mb-3">⏳</div>
          <p className="text-sm">Loading analytics…</p>
        </div>
      </div>
    )
  }

  const maxWeekly = Math.max(...weekly.map(d => d.count), 1)
  const maxEvent  = Math.max(...byEvent.map(e => e.count), 1)

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time attendance insights</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          Live
          {lastUpdated && <span className="ml-1">· updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Attendance',  value: overview?.totalAttendance ?? 0,  icon: '✅' },
          { label: 'Unique Attendees',  value: overview?.uniqueAttendees  ?? 0,  icon: '👤' },
          { label: 'Avg per Event',     value: overview?.avgPerEvent      ?? 0,  icon: '📊' },
          { label: 'Duplicate Rate',    value: `${overview?.duplicateRate ?? 0}%`, icon: '⚠️' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">{s.label}</p>
                <p className="text-2xl font-bold text-gray-800">{s.value}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Weekly bar chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-5">Last 7 Days</h3>
          <div className="flex items-end justify-between h-36 gap-2">
            {weekly.map(d => {
              const heightPct = Math.round((d.count / maxWeekly) * 100)
              return (
                <div key={d.day} className="flex flex-col items-center flex-1 gap-1">
                  {d.count > 0 && <span className="text-xs font-semibold text-indigo-600">{d.count}</span>}
                  <div
                    className="w-full rounded-t-lg bg-indigo-500 opacity-80 transition-all duration-500"
                    style={{ height: `${Math.max(4, heightPct)}%` }}
                  />
                  <span className="text-xs text-gray-500">{d.day}</span>
                  {d.count === 0 && <span className="text-xs text-gray-300">0</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* By event */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-5">Attendance by Event</h3>
          {byEvent.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
          ) : (
            <div className="space-y-4">
              {byEvent.slice(0, 5).map((ev, i) => (
                <div key={ev.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-600 truncate max-w-[70%]">{ev.name}</span>
                    <span className="font-semibold text-gray-800">{ev.count}</span>
                  </div>
                  <Bar pct={Math.round((ev.count / maxEvent) * 100)} colorClass={EVENT_COLORS[i % EVENT_COLORS.length]} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Method */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-5">Check-in Method</h3>
          {byMethod.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
          ) : (
            <div className="space-y-4">
              {byMethod.map((m, i) => (
                <div key={m.label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-600">{m.label}</span>
                    <span className="font-semibold text-gray-800">{m.pct}%</span>
                  </div>
                  <Bar pct={m.pct} colorClass={METHOD_COLORS[i % METHOD_COLORS.length]} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live feed */}
        <LiveFeed profile={profile} />
      </div>
    </div>
  )
}

// ── Live feed component ───────────────────────────────────────────────────────
interface LiveRecord {
  id: string
  full_name: string
  phone: string
  method: string
  status: string
  submitted_at: string
}

function LiveFeed({ profile }: { profile: { id: string; role: string } | null }) {
  const [records, setRecords] = useState<LiveRecord[]>([])

  useEffect(() => {
    if (!profile) return

    // Load last 10 recent records
    const load = async () => {
      let q = supabase
        .from('attendance_records')
        .select('id, full_name, phone, method, status, submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(10)

      if (profile.role !== 'super_admin') {
        const { data: myEvents } = await supabase.from('events').select('id').eq('created_by', profile.id)
        const ids = myEvents?.map(e => e.id) ?? []
        if (ids.length > 0) q = q.in('event_id', ids)
        else { setRecords([]); return }
      }

      const { data } = await q
      setRecords((data as LiveRecord[]) ?? [])
    }
    load()

    // Subscribe for new inserts
    const channel = supabase
      .channel('live-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_records' },
        (payload) => {
          setRecords(prev => [payload.new as LiveRecord, ...prev].slice(0, 10))
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-gray-800">Live Check-ins</h3>
        <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      </div>
      {records.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Waiting for check-ins…</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {records.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{r.full_name}</p>
                <p className="text-xs text-gray-400">{r.phone}</p>
              </div>
              <div className="text-right">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  r.status === 'verified' ? 'bg-green-100 text-green-700' :
                  r.status === 'duplicate' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{r.status}</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(r.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}