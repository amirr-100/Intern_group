'use client'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
  { label: 'Events', href: '/admin/events', icon: '📅' },
  { label: 'Analytics', href: '/admin/analytics', icon: '📈' },
  { label: 'Archives', href: '/admin/archives', icon: '🗄️' },
  { label: 'Profiles', href: '/admin/profiles', icon: '👥', role: 'super_admin' },
]

export default function Sidebar({ isOpen }: { isOpen: boolean }) {
  const { profile, signOut } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const filteredItems = navItems.filter(
    (item) => !item.role || profile?.role === item.role
  )

  const handleLogout = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Context signOut failed, trying direct sign out:', err)
      await supabase.auth.signOut()
      router.push('/login')
    }
  }

  return (
    <aside
      className={`fixed top-0 left-0 z-30 h-full w-64 bg-white border-r border-gray-200 shadow-lg transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Logo section */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="w-10 h-10 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center text-xl text-indigo-600 flex-shrink-0">
          📋
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-800 tracking-tight">Smart Attendance</h2>
          <p className="text-xs text-gray-400">Admin Panel</p>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {filteredItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
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

      {/* Footer / Sign out */}
      <div className="px-4 py-4 border-t border-gray-100">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl justify-center  text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}