'use client'
import { useAuth } from '@/lib/AuthContext'

export default function Topbar() {
  const { profile } = useAuth()

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left side – page title (could be dynamic later) */}
        <div>
          <h1 className="text-lg font-bold text-gray-800">Dashboard</h1>
        </div>

        {/* Right side – admin info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
              {profile?.full_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-800 leading-tight">
                {profile?.full_name || profile?.email}
              </h4>
              <p className="text-xs text-gray-500 capitalize">{profile?.role?.replace('_', ' ') || 'admin'}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}