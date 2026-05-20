'use client'
import { useAuth } from '@/lib/AuthContext'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
  { label: 'Events', href: '/admin/events', icon: '📅' },
  { label: 'Profiles', href: '/admin/profiles', icon: '👥', role: 'super_admin' },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const pathname = usePathname()

  const filteredItems = navItems.filter(item => !item.role || profile?.role === item.role)

  return (
    <aside className="sidebar">
      <div className="logo-section">
        <div className="logo-mark">📋</div>
        <div>
          <h2>Smart Attendance</h2>
          <p>Admin Panel</p>
        </div>
      </div>
      <nav className="sidebar-nav">
        {filteredItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname.startsWith(item.href) ? 'active' : ''}`}
          >
            <span>{item.icon}</span> {item.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="logout-btn" onClick={signOut}>
          <span>🚪</span> Logout
        </button>
      </div>
    </aside>
  )
}