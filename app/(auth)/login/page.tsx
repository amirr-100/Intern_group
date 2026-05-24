﻿'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) { setError(signInError.message); setLoading(false); return }

      // Check first_login directly — don't wait for AuthContext
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session error. Please try again.'); setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles').select('is_first_login').eq('id', user.id).maybeSingle()

      router.replace(profile?.is_first_login ? '/(auth)/first-login' : '/admin/dashboard')
    } catch {
      setError('An unexpected error occurred.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 items-center justify-center">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 text-center text-white px-12">
          <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl shadow-2xl mx-auto mb-6">📋</div>
          <h1 className="text-4xl font-bold mb-4">Smart Attendance</h1>
          <p className="text-indigo-200 text-lg max-w-sm mx-auto">Secure QR check-in for your events, meetings, and workshops.</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-100 rounded-2xl text-2xl mb-3">📋</div>
            <h2 className="text-2xl font-bold text-gray-800">Smart Attendance</h2>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Welcome back</h2>
            <p className="text-gray-500 mb-8 text-sm">Sign in to your admin account</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="admin@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-50 shadow-lg shadow-indigo-200">
                {loading
                  ? <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>Signing in…
                    </span>
                  : 'Sign In'}
              </button>
            </form>
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            First time?{' '}
            <Link href="/(auth)/first-login" className="text-indigo-600 font-medium hover:underline">Complete your profile →</Link>
          </p>
        </div>
      </div>
    </div>
  )
}