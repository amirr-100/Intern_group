'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Profile } from '@/types/database'

function ProfilesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [toastMsg, setToastMsg] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Get the caller's own profile first — we need to gate on role
      const { data: me } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!me || me.role !== 'super_admin') {
        // Regular admins have no business on this page
        router.push('/admin/dashboard')
        return
      }

      setCurrentProfile(me)

      // Super admin can see all profiles (RLS: sa_read_all_profiles)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error) setProfiles(data || [])
      setLoading(false)
    }
    init()
  }, [router])

  // Show "created" toast if redirected from new-admin form
  useEffect(() => {
    if (searchParams.get('created') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToastMsg('Admin account created successfully')
      const t = setTimeout(() => setToastMsg(''), 4000)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  const toggleActive = async (p: Profile) => {
    const next = !p.is_active
    await supabase.from('profiles').update({ is_active: next }).eq('id', p.id)
    setProfiles((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, is_active: next } : x))
    )
  }

  const roleBadge = (role: string) => {
    if (role === 'super_admin')
      return 'bg-purple-100 text-purple-700 border-purple-200'
    return 'bg-blue-100 text-blue-700 border-blue-200'
  }

  const initials = (p: Profile) => {
    if (p.full_name) {
      const parts = p.full_name.trim().split(' ')
      return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
    }
    return p.email?.[0]?.toUpperCase() ?? '?'
  }

  const adminProfiles = profiles.filter((p) => p.role !== 'super_admin')
  const superAdmins = profiles.filter((p) => p.role === 'super_admin')

  return (
    <div>
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage the people who can create events and take attendance.
          </p>
        </div>
        <Link
          href="/admin/profiles/new"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add admin
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading accounts…
        </div>
      )}

      {/* Empty */}
      {!loading && adminProfiles.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-2">No admin accounts yet</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
            Create your first admin account. They will receive login credentials and set up their profile on first sign-in.
          </p>
          <Link
            href="/admin/profiles/new"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add first admin
          </Link>
        </div>
      )}

      {/* Admin list */}
      {!loading && adminProfiles.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Mobile: card stack */}
          <div className="divide-y divide-gray-100 sm:hidden">
            {adminProfiles.map((p) => (
              <div key={p.id} className="px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm shrink-0">
                    {initials(p).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {p.full_name || <span className="text-gray-400 font-normal italic">Profile not set up</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{p.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${roleBadge(p.role)}`}>
                    {p.role.replace('_', ' ')}
                  </span>
                  {p.institution && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                      {p.institution}
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 ${
                    p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {p.is_first_login && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                      Awaiting first login
                    </span>
                  )}
                </div>
                <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => toggleActive(p)}
                    className="text-xs text-gray-500 hover:text-gray-800 transition"
                  >
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Admin</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Institution</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Role</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Setup</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {adminProfiles.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-xs shrink-0">
                          {initials(p).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {p.full_name || <span className="text-gray-400 font-normal italic">Not set up yet</span>}
                          </p>
                          <p className="text-xs text-gray-500">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {p.institution || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${roleBadge(p.role)}`}>
                        {p.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {p.is_first_login ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                          Awaiting first login
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Complete</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => toggleActive(p)}
                        className="text-xs text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        {p.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Super admin section (read-only) */}
      {!loading && superAdmins.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Super admin</h2>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {superAdmins.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold text-xs shrink-0">
                  {initials(p).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{p.full_name || p.email}</p>
                  <p className="text-xs text-gray-500">{p.email}</p>
                </div>
                <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${roleBadge(p.role)}`}>
                  super admin
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
export default function ProfilesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>}>
      <ProfilesPageInner />
    </Suspense>
  )
}