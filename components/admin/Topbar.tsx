'use client'
import { useAuth } from '@/lib/AuthContext'

export default function Topbar() {
  const { profile } = useAuth()
  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="page-title">Smart Attendance</h1>
      </div>
      <div className="topbar-right">
        <div className="admin-chip">
          <div className="admin-avatar">{profile?.full_name?.[0] || 'A'}</div>
          <div>
            <h4>{profile?.full_name || profile?.email}</h4>
            <p>{profile?.role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}