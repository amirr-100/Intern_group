// components/Sidebar.tsx
'use client'
import { useAuth } from '@/lib/AuthContext'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
  { label: 'Events',    href: '/admin/events',    icon: '📅' },
  { label: 'Sessions',  href: '/admin/sessions',  icon: '🔗' },       // ← NEW
  { label: 'Analytics', href: '/admin/analytics', icon: '📈' },
  { label: 'Archives',  href: '/admin/archives',  icon: '🗄️' },
  { label: 'Profiles',  href: '/admin/profiles',  icon: '👥', superOnly: true },
]

export default function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose?: () => void   // optional, allows closing the sidebar on mobile
}) {
  const { profile, signOut } = useAuth()
  const pathname = usePathname()

  const visible = navItems.filter(
    (item) => !item.superOnly || profile?.role === 'super_admin'
  )

  return (
    <>
      {/* Mobile overlay – closes sidebar when tapped */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-white border-r border-gray-200 shadow-lg
          flex flex-col transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="w-10 h-10 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
            📋
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-800 tracking-tight">Smart Attendance</h2>
            <p className="text-xs text-gray-400">Admin Panel</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {visible.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}   // ← close sidebar on navigation
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-5 bg-indigo-600 rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* User info + logout */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-100 space-y-2">
          {profile && (
            <div className="px-3 py-2 rounded-xl bg-gray-50">
              <p className="text-xs font-semibold text-gray-700 truncate">
                {profile.full_name || profile.email}
              </p>
              <p className="text-xs text-gray-400 capitalize mt-0.5">
                {profile.role.replace('_', ' ')}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={signOut}
            className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl
              text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}