'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  const router = useRouter()
  // Desktop: open by default. Mobile: closed by default.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // Safe SSR default — window only exists client-side
    if (typeof window === 'undefined') return false
    return window.matchMedia('(min-width: 1024px)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!loading && !profile) router.replace('/login')
  }, [profile, loading, router])

  if (!loading && !profile) return null

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