'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface AttendanceRecord {
  id: string
  full_name: string
  phone: string
  email: string | null
  institution: string | null
  designation: string | null
  method: 'qr_scan' | 'manual' | 'paper_upload'
  status: 'verified' | 'pending' | 'duplicate'
  submitted_at: string
}

const METHOD_STYLES: Record<string, string> = {
  qr_scan:      'bg-green-100 text-green-700',
  manual:       'bg-blue-100 text-blue-700',
  paper_upload: 'bg-amber-100 text-amber-700',
}
const METHOD_LABELS: Record<string, string> = {
  qr_scan: 'QR scan', manual: 'Manual', paper_upload: 'Paper',
}
const STATUS_STYLES: Record<string, string> = {
  verified:  'bg-green-100 text-green-700',
  pending:   'bg-amber-100 text-amber-700',
  duplicate: 'bg-red-100 text-red-700',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function AttendancePage() {
  const { eventId, sessionId } = useParams<{ eventId: string; sessionId: string }>()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterMethod, setFilterMethod] = useState<string>('all')

  const fetchRecords = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_records')
      .select('id, full_name, phone, email, institution, designation, method, status, submitted_at')
      .eq('session_id', sessionId)
      .order('submitted_at', { ascending: false })
    setRecords((data as AttendanceRecord[]) || [])
    setLoading(false)
  }, [sessionId])

  // Effect to load initial data
  useEffect(() => {
    const loadData = async () => {
      await fetchRecords()
    }
    loadData()
  }, [fetchRecords])

  // Real-time subscription (separate effect to avoid re-running fetchRecords on every subscription)
  useEffect(() => {
    const channel = supabase
      .channel(`attendance-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_records', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setRecords((prev) => [payload.new as AttendanceRecord, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  const filtered = records.filter((r) => {
    const matchStatus = filterStatus === 'all' || r.status === filterStatus
    const matchMethod = filterMethod === 'all' || r.method === filterMethod
    const matchSearch = !search ||
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      r.phone.includes(search) ||
      (r.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.institution ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchMethod && matchSearch
  })

  const exportCSV = () => {
    const rows = [
      ['Name', 'Phone', 'Email', 'Institution', 'Designation', 'Method', 'Status', 'Time'],
      ...filtered.map((r) => [
        r.full_name, r.phone, r.email ?? '', r.institution ?? '',
        r.designation ?? '', r.method, r.status, fmtTime(r.submitted_at),
      ]),
    ]
    const csv = rows.map((row) => row.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${sessionId.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const counts = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <Link href={`/admin/events/${eventId}/sessions/${sessionId}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to session
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Attendance records</h1>
          <p className="text-sm text-gray-500 mt-1">
            {records.length} total · {counts.verified ?? 0} verified · {counts.duplicate ?? 0} duplicate
          </p>
        </div>
        <button onClick={exportCSV}
          className="inline-flex items-center gap-2 border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {/* Status */}
        {['all', 'verified', 'duplicate', 'pending'].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterStatus === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}>
            {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && counts[s] ? <span className={`ml-1 ${filterStatus === s ? 'text-indigo-200' : 'text-gray-400'}`}>{counts[s]}</span> : null}
          </button>
        ))}
        <div className="w-px bg-gray-200 self-stretch mx-1" />
        {['all', 'qr_scan', 'manual', 'paper_upload'].map((m) => (
          <button key={m} onClick={() => setFilterMethod(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterMethod === m ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}>
            {m === 'all' ? 'All methods' : METHOD_LABELS[m]}
          </button>
        ))}
        {/* Search */}
        <div className="ml-auto flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 text-xs min-w-0 max-w-[200px]">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="bg-transparent outline-none w-full text-xs text-gray-700 placeholder-gray-400" />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading records…
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-1">
            {search || filterStatus !== 'all' || filterMethod !== 'all' ? 'No records match your filters' : 'No records yet'}
          </p>
          <p className="text-xs text-gray-400">
            {records.length === 0 ? 'Records will appear here in real-time as attendees check in.' : 'Try adjusting your search or filters.'}
          </p>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && filtered.length > 0 && (
        <>
          <div className="sm:hidden space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{r.full_name}</p>
                    <p className="text-xs text-gray-500">{r.phone}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className={`px-2.5 py-0.5 rounded-full font-medium ${METHOD_STYLES[r.method]}`}>
                    {METHOD_LABELS[r.method]}
                  </span>
                  {r.institution && (
                    <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{r.institution}</span>
                  )}
                  <span className="ml-auto text-gray-400">{fmtTime(r.submitted_at)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Name', 'Phone', 'Email', 'Institution', 'Method', 'Status', 'Time'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 first:pl-5 last:pr-5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${r.status === 'duplicate' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3 pl-5 text-sm font-medium text-gray-900">{r.full_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[140px] truncate">{r.email ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[140px] truncate">{r.institution ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${METHOD_STYLES[r.method]}`}>
                        {METHOD_LABELS[r.method]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 pr-5 text-xs text-gray-400 whitespace-nowrap">{fmtTime(r.submitted_at)}</td>
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