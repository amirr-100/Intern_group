'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import type { AttendanceRecord } from '@/types/database'

export default function AttendancePage() {
  const { eventId, sessionId } = useParams<{ eventId: string; sessionId: string }>()
  const [records, setRecords] = useState<AttendanceRecord[]>([])

  useEffect(() => {
    supabase
      .from('attendance_records')
      .select('*')
      .eq('session_id', sessionId)
      .order('submitted_at', { ascending: false })
      .then(({ data }) => setRecords(data || []))
  }, [sessionId])

  return (
    <div>
      <div className="page-header">
        <h1>Attendance Records</h1>
        <button className="btn btn-primary btn-sm" onClick={() => {
          const csv = [['Name','Phone','Email','Method','Status','Time']]
          records.forEach(r => csv.push([r.full_name,r.phone,r.email||'',r.method,r.status,r.submitted_at]))
          const blob = new Blob([csv.map(row => row.join(',')).join('\n')], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = 'attendance.csv'; a.click()
        }}>
          Export CSV
        </button>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Method</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>
            {records.map(rec => (
              <tr key={rec.id}>
                <td>{rec.full_name}</td>
                <td>{rec.phone}</td>
                <td>{rec.email || '—'}</td>
                <td><span className={`badge ${rec.method === 'qr_scan' ? 'verified' : 'manual'}`}>{rec.method}</span></td>
                <td><span className={`badge ${rec.status}`}>{rec.status}</span></td>
                <td>{new Date(rec.submitted_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}