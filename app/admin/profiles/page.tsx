'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import type { Profile } from '@/types/database'

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])

  useEffect(() => {
    supabase.from('profiles').select('*').then(({ data }) => setProfiles(data || []))
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1>Admin Accounts</h1>
        <Link href="/admin/profiles/new" className="btn btn-primary">+ Add Admin</Link>
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>First Login</th></tr></thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id}>
                <td>{p.full_name || '—'}</td>
                <td>{p.email}</td>
                <td><span className="badge">{p.role}</span></td>
                <td><span className={`badge ${p.is_active ? 'active' : 'ended'}`}>{p.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>{p.is_first_login ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}