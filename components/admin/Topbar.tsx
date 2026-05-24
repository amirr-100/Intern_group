'use client'
import { useAuth } from '@/lib/AuthContext'
import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/events':    'Events',
  '/admin/sessions':  'Sessions',
  '/admin/analytics': 'Analytics',
  '/admin/archives':  'Archives',
  '/admin/profiles':  'Profiles',
}

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { profile } = useAuth()
  const pathname = usePathname()

  const title = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname === key || pathname.startsWith(key + '/')
  )?.[1] ?? 'Admin'

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-4 sm:px-6 h-14">
        <div className="flex items-center gap-3">
          {/* Hamburger */}
          <button onClick={onMenuClick}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition lg:flex"
            aria-label="Toggle sidebar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <h1 className="text-base sm:text-lg font-bold text-gray-800">{title}</h1>
        </div>

        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5 border border-gray-200">
          <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-gray-800 leading-tight truncate max-w-[120px]">
              {profile?.full_name || profile?.email}
            </p>
            <p className="text-xs text-gray-400 capitalize">{profile?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  )
}