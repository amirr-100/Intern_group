'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/admin/Sidebar'
import Topbar from '@/components/admin/Topbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    // Only redirect once we're sure there's no profile
    if (!loading && !profile) {
      router.replace('/login')
    }
  }, [profile, loading, router])

  // Show shell immediately — don't block on auth loading
  // Individual pages handle their own loading states
  if (!loading && !profile) {
    // Redirecting — show nothing to avoid flash
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} />
      <div className={`transition-all duration-300 ease-in-out ${sidebarOpen ? 'lg:ml-64' : 'ml-0'}`}>
        <Topbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}