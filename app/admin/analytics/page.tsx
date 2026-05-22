'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────
interface OverviewStats {
  totalAttendance: number
  uniqueAttendees: number
  avgPerEvent: number
  duplicateRate: number
}

interface DayCount { day: string; count: number }
interface EventCount { name: string; count: number }
interface MethodCount { label: string; count: number; pct: number }

// ── Small bar component ────────────────────────────────────────────────────────
function Bar({ pct, colorClass }: { pct: number; colorClass: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${colorClass} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Method label map ─────────────────────────────────────────────────────────
const METHOD_LABELS: Record<string, string> = {
  qr:     'QR Scan',
  manual: 'Manual Entry',
  paper:  'Paper Upload',
}

const METHOD_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500']
const EVENT_COLORS  = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500']

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [weekly, setWeekly] = useState<DayCount[]>([])
  const [byEvent, setByEvent] = useState<EventCount[]>([])
  const [byMethod, setByMethod] = useState<MethodCount[]>([])
  const [totalFlagged] = useState(0)   // extend later if you add a duplicate flag
  const [loading, setLoading] = useState(true)

  // ── Auth redirect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !profile) router.push('/login')
  }, [authLoading, profile, router])

  // ── Fetch analytics (memoised with useCallback) ────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    const isSuperAdmin = profile!.role === 'super_admin'

    // 1. Determine which event_ids to scope to
    let scopedEventIds: string[] | null = null
    if (!isSuperAdmin) {
      const { data: myEvents } = await supabase
        .from('events')
        .select('id')
        .eq('created_by', profile!.id)
        .eq('is_archived', false)
      scopedEventIds = myEvents?.map((e) => e.id) ?? []
    }

    // Helper: build a base attendees query scoped to this admin
    function attendeesBase() {
      let q = supabase.from('attendees').select('*')
      if (scopedEventIds !== null) {
        if (scopedEventIds.length === 0) return null   // no events → nothing
        q = q.in('event_id', scopedEventIds)
      }
      return q
    }

    // 2. Fetch all attendees (for phone dedup & method breakdown)
    const base = attendeesBase()
    if (!base) {
      // Admin has no events yet
      setOverview({ totalAttendance: 0, uniqueAttendees: 0, avgPerEvent: 0, duplicateRate: 0 })
      setWeekly(buildEmptyWeek())
      setByEvent([])
      setByMethod([])
      setLoading(false)
      return
    }

    const { data: allAttendees } = await base

    const totalAttendance = allAttendees?.length ?? 0
    const uniquePhones = new Set(allAttendees?.map((r) => r.phone) ?? []).size

    // 3. Event count for avg
    let evCount = 0
    {
      let q = supabase.from('events').select('id', { count: 'exact', head: true })
      if (scopedEventIds !== null && scopedEventIds.length > 0) {
        q = q.in('id', scopedEventIds)
      }
      const { count } = await q
      evCount = count ?? 0
    }

    const avgPerEvent = evCount > 0 ? Math.round(totalAttendance / evCount) : 0
    const duplicateRate = 0  // extend when you add duplicate tracking

    setOverview({ totalAttendance, uniqueAttendees: uniquePhones, avgPerEvent, duplicateRate })

    // 4. Last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const recent = allAttendees?.filter(
      (r) => new Date(r.submitted_at) >= sevenDaysAgo
    ) ?? []

    const dayMap: Record<string, number> = {}
    recent.forEach((r) => {
      const label = new Date(r.submitted_at).toLocaleDateString('en-US', { weekday: 'short' })
      dayMap[label] = (dayMap[label] ?? 0) + 1
    })
    setWeekly(buildWeekFromMap(dayMap))

    // 5. Attendance by event (fetch event names for scoped IDs)
    const eventsForBreakdown =
      scopedEventIds !== null
        ? await supabase.from('events').select('id, name').in('id', scopedEventIds.length ? scopedEventIds : ['00000000-0000-0000-0000-000000000000'])
        : await supabase.from('events').select('id, name')

    const eventNameMap: Record<string, string> = {}
    eventsForBreakdown.data?.forEach((e) => { eventNameMap[e.id] = e.name })

    const eventCountMap: Record<string, number> = {}
    allAttendees?.forEach((r) => {
      const name = eventNameMap[r.event_id] ?? 'Unknown'
      eventCountMap[name] = (eventCountMap[name] ?? 0) + 1
    })
    const byEventArr = Object.entries(eventCountMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
    setByEvent(byEventArr)

    // 6. Method breakdown
    const methodMap: Record<string, number> = {}
    allAttendees?.forEach((r) => {
      const m = r.check_in_method ?? 'unknown'
      methodMap[m] = (methodMap[m] ?? 0) + 1
    })
    const byMethodArr: MethodCount[] = Object.entries(methodMap)
      .map(([method, count]) => ({
        label: METHOD_LABELS[method] ?? method,
        count,
        pct: totalAttendance > 0 ? Math.round((count / totalAttendance) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
    setByMethod(byMethodArr)

    setLoading(false)
  }, [profile])   // depends only on profile

  // ── Trigger fetch once profile is ready (cancellation-safe) ────────────────
  useEffect(() => {
    if (!profile) return

    let cancelled = false

    const load = async () => {
      if (!cancelled) setLoading(true)
      await fetchAnalytics()
      if (cancelled) setLoading(false)
    }

     
    load()

    return () => {
      cancelled = true
    }
  }, [profile, fetchAnalytics])

  // ── Loading state ──────────────────────────────────────────────────────────
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

  const maxWeekly = Math.max(...weekly.map((d) => d.count), 1)
  const maxEvent  = Math.max(...byEvent.map((e) => e.count), 1)

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Real‑time attendance insights</p>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Attendance',  value: overview?.totalAttendance ?? 0, icon: '✅' },
          { label: 'Unique Attendees',  value: overview?.uniqueAttendees  ?? 0, icon: '👤' },
          { label: 'Avg per Event',     value: overview?.avgPerEvent      ?? 0, icon: '📊' },
          { label: 'Duplicate Rate',    value: `${overview?.duplicateRate ?? 0}%`, icon: '⚠️' },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">
                  {s.label}
                </p>
                <p className="text-2xl font-bold text-gray-800">{s.value}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">
                {s.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Weekly bar chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-5">Last 7 Days</h3>
          <div className="flex items-end justify-between h-36 gap-2">
            {weekly.map((d) => {
              const heightPct = Math.round((d.count / maxWeekly) * 100)
              return (
                <div key={d.day} className="flex flex-col items-center flex-1 gap-1">
                  {d.count > 0 && (
                    <span className="text-xs font-semibold text-indigo-600">{d.count}</span>
                  )}
                  <div
                    className="w-full rounded-t-lg bg-indigo-500 opacity-80 transition-all duration-500"
                    style={{ height: `${Math.max(4, heightPct)}%` }}
                  />
                  <span className="text-xs text-gray-500">{d.day}</span>
                  {d.count === 0 && (
                    <span className="text-xs text-gray-300">0</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Attendance by event */}
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
                  <Bar
                    pct={Math.round((ev.count / maxEvent) * 100)}
                    colorClass={EVENT_COLORS[i % EVENT_COLORS.length]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Check-in method */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-5">Check‑in Method</h3>
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

        {/* Duplicate detection */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-5">Duplicate Detection</h3>
          <div className="text-center py-6 bg-red-50 rounded-xl mb-4">
            <p className="text-4xl font-bold text-red-600">{totalFlagged}</p>
            <p className="text-sm text-red-500 mt-1">Total flagged duplicates</p>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            The system blocks duplicate submissions per session by phone number.
            Add an <code className="bg-gray-100 px-1 rounded text-xs">is_duplicate</code> column
            to <code className="bg-gray-100 px-1 rounded text-xs">attendees</code> to track
            flagged attempts.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildEmptyWeek(): DayCount[] {
  return buildWeekFromMap({})
}

function buildWeekFromMap(dayMap: Record<string, number>): DayCount[] {
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const today = new Date().getDay()  // 0 = Sun
  return Array.from({ length: 7 }, (_, i) => {
    const dayIdx = (today - 6 + i + 7) % 7
    const label = DAY_SHORT[dayIdx]
    return { day: label, count: dayMap[label] ?? 0 }
  })
}