'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

// ── Types ────────────────────────────────────────
interface ArchivedEvent {
  id: string
  name: string
  event_date: string
  location: string
  created_at: string
}

interface PaperFile {
  id: string
  session_id: string
  event_id: string
  file_url: string
  file_type: string
  original_name: string | null
  uploaded_at: string
  notes: string | null
}

interface AdminProfile {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
}

type ReportFormat = 'csv' | 'pdf' | 'excel'

export default function ArchivesPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [archivedEvents, setArchivedEvents] = useState<ArchivedEvent[]>([])
  const [paperFiles, setPaperFiles] = useState<PaperFile[]>([])
  const [adminProfiles, setAdminProfiles] = useState<AdminProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'events' | 'files' | 'admins'>('events')
  const [reportFormat, setReportFormat] = useState<ReportFormat>('csv')

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login')
    }
  }, [authLoading, profile, router])

  useEffect(() => {
    if (!profile) return

    const fetchArchives = async () => {
      setLoading(true)

      // 1. Archived events
      const { data: events } = await supabase
        .from('events')
        .select('id, name, event_date, location, created_at')
        .eq('is_archived', true)
        .order('event_date', { ascending: false })

      setArchivedEvents(events || [])

      // 2. Paper attendance files
      const { data: files } = await supabase
        .from('paper_attendance_files')
        .select('id, session_id, event_id, file_url, file_type, original_name, uploaded_at, notes')
        .order('uploaded_at', { ascending: false })

      setPaperFiles(files || [])

      // 3. Admin profiles (only for super_admin)
      if (profile.role === 'super_admin') {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, is_active')
          .order('created_at', { ascending: false })

        setAdminProfiles(admins || [])
      }

      setLoading(false)
    }

    fetchArchives()
  }, [profile])

  // ── Export helper (CSV only for now) ──────────────
  const exportCSV = (headers: string[], rows: string[][], filename: string) => {
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const generateExport = () => {
    const headers = ['Name', 'Date', 'Location', 'Archived On']
    const rows = archivedEvents.map(e => [
      e.name,
      e.event_date,
      e.location,
      new Date(e.created_at).toLocaleDateString(),
    ])

    if (reportFormat === 'csv') {
      exportCSV(headers, rows, `archived-events.csv`)
    } else {
      // Placeholder for PDF/Excel
      alert(`${reportFormat.toUpperCase()} generation will be available soon. Downloading as CSV for now.`)
      exportCSV(headers, rows, `archived-events.csv`)
    }
  }

  // Unarchive event
  const unarchiveEvent = async (eventId: string) => {
    await supabase.from('events').update({ is_archived: false }).eq('id', eventId)
    setArchivedEvents(prev => prev.filter(e => e.id !== eventId))
  }

  if (authLoading || loading) {
    return <div className="text-center py-16 text-gray-400">Loading archives…</div>
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Archives</h1>
        <p className="text-sm text-gray-500 mt-1">Stored historical data and documents</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-6">
        {[
          { key: 'events', label: `Archived Events (${archivedEvents.length})` },
          { key: 'files', label: `Paper Files (${paperFiles.length})` },
          ...(profile?.role === 'super_admin'
            ? [{ key: 'admins', label: `Admin Records (${adminProfiles.length})` }]
            : []),
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-indigo-700 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'events' && (
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800">Archived Events</h3>
          </div>
          {archivedEvents.length === 0 ? (
            <p className="p-6 text-gray-500 text-center">No archived events.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Date</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Location</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Archived On</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {archivedEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{event.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{event.event_date}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{event.location}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(event.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => unarchiveEvent(event.id)}
                          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Unarchive
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'files' && (
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800">Paper Attendance Files</h3>
          </div>
          {paperFiles.length === 0 ? (
            <p className="p-6 text-gray-500 text-center">No paper files uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Type</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Original Name</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Uploaded</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Notes</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paperFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-800 capitalize">{file.file_type}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {file.original_name || file.file_url.split('/').pop() || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(file.uploaded_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{file.notes || '—'}</td>
                      <td className="px-6 py-4">
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                        >
                          View / Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'admins' && profile?.role === 'super_admin' && (
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800">Admin Records</h3>
          </div>
          {adminProfiles.length === 0 ? (
            <p className="p-6 text-gray-500 text-center">No admin accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Role</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {adminProfiles.map((admin) => (
                    <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">
                        {admin.full_name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{admin.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex text-xs font-semibold px-2 py-1 rounded-full ${
                          admin.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {admin.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
                          admin.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${admin.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {admin.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reports section – Events only, with format dropdown */}
      <div className="mt-10 bg-white rounded-2xl shadow-md border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Generate Report</h3>
        <p className="text-sm text-gray-500 mb-4">
          Export the list of archived events in the format you choose.
        </p>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <select
            value={reportFormat}
            onChange={(e) => setReportFormat(e.target.value as ReportFormat)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          >
            <option value="csv">CSV</option>
            <option value="pdf">PDF (coming soon)</option>
            <option value="excel">Excel (coming soon)</option>
          </select>
        </div>
        <button
          onClick={generateExport}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition"
        >
          📅 Download Events Report
        </button>
      </div>
    </div>
  )
}