// app/admin/layout.tsx
'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  const router = useRouter()

  // ✅ FIXED: Always start false (server-safe), then set real value after mount
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    // This runs only on the client, after hydration — safe to use window
    const mq = window.matchMedia('(min-width: 1024px)')
    setSidebarOpen(mq.matches)
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!loading && !profile) router.replace('/login')
  }, [profile, loading, router])

  // ✅ FIXED: Show a skeleton instead of blank null during auth load
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-indigo-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={`transition-all duration-300 ease-in-out ${sidebarOpen ? 'lg:ml-64' : 'ml-0'}`}>
        <Topbar onMenuClick={() => setSidebarOpen(prev => !prev)} />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}