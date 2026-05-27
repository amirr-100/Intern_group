﻿'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const DISTRICTS = [
  'Western Area Urban', 'Western Area Rural', 'Bo', 'Bombali',
  'Bonthe', 'Falaba', 'Kailahun', 'Kambia', 'Karene', 'Kenema',
  'Koinadugu', 'Kono', 'Moyamba', 'Port Loko', 'Pujehun', 'Tonkolili',
]

export default function FirstLoginPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    institution: '',
    designation: '',
    district: '',
  })
  const [newPassword, setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState(false)
  const [loading, setLoading]             = useState(false)
  const [isLoggedIn, setIsLoggedIn]       = useState<boolean | null>(null)

  // ── Check authentication + profile on mount ─────────────────────────────
  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return

      if (!user) {
        setIsLoggedIn(false)
        return
      }

      setIsLoggedIn(true)

      // Already completed setup → go straight to dashboard
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_first_login')
        .eq('id', user.id)
        .maybeSingle()

      if (!cancelled && profile && !profile.is_first_login) {
        router.replace('/admin/dashboard')
      }
    }

    check()
    return () => { cancelled = true }
  }, [router])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword) {
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    if (!form.full_name.trim()) {
      setError('Full name is required.')
      return
    }

    setLoading(true)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('Session expired. Please sign in again.')
        router.replace('/login')
        return
      }

      if (newPassword) {
        const { error: pwError } = await supabase.auth.updateUser({ password: newPassword })
        if (pwError) {
          setError(`Password update failed: ${pwError.message}`)
          setLoading(false)
          return
        }
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name:    form.full_name.trim(),
          phone:        form.phone.trim() || null,
          institution:  form.institution.trim() || null,
          designation:  form.designation.trim() || null,
          district:     form.district || null,
          is_first_login: false,
        })
        .eq('id', user.id)

      if (profileError) {
        console.error('Profile update error:', profileError)
        setError(
          profileError.code === '42501'
            ? 'Permission denied. Ask your administrator to add an UPDATE policy on the profiles table.'
            : profileError.message
        )
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => router.replace('/admin/dashboard'), 1200)
    } catch (err) {
      console.error(err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Checking auth ────────────────────────────────────────────────────────
  if (isLoggedIn === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-3xl mb-3">⏳</div>
          <p className="text-sm text-gray-500">Verifying your session…</p>
        </div>
      </div>
    )
  }

  // ── Not authenticated ────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center border border-gray-100">
          <div className="text-4xl mb-4">🔐</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">You&apos;re not signed in</h2>
          <p className="text-sm text-gray-500 mb-6">
            Please log in first to complete your profile setup.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition"
          >
            ← Go to Login
          </Link>
        </div>
      </div>
    )
  }

  // ── Authenticated — show form ─────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">

      {/* Left – Brand Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-80 h-80 bg-white rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-white/20 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-white/10 rounded-full" />
        </div>
        <div className="relative z-10 flex flex-col justify-center items-center text-white px-16 text-center">
          <div className="mb-8 relative">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl shadow-2xl">
              ✨
            </div>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-pulse" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Welcome!</h1>
          <p className="text-indigo-200 text-lg max-w-sm">
            Complete your profile to start using Smart Attendance.
          </p>
          <div className="absolute bottom-10 text-sm text-indigo-300">
            First‑time setup
          </div>
        </div>
      </div>

      {/* Right – Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-100 rounded-2xl text-2xl mb-3">
              ✨
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Complete Profile</h2>
            <p className="text-sm text-gray-500 mt-1">Set up your admin account</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Complete your profile</h2>
            <p className="text-gray-500 mb-6">
              This is your first login. Please fill in your details.
            </p>

            {/* Error banner */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Success banner */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Profile saved! Redirecting to dashboard…
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  required
                  placeholder="John Doe"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow hover:shadow-sm"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+232 76 000 000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow hover:shadow-sm"
                />
              </div>

              {/* Institution + Designation */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Institution</label>
                  <input
                    type="text"
                    name="institution"
                    value={form.institution}
                    onChange={handleChange}
                    placeholder="Organisation"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow hover:shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Designation</label>
                  <input
                    type="text"
                    name="designation"
                    value={form.designation}
                    onChange={handleChange}
                    placeholder="Role / Title"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow hover:shadow-sm"
                  />
                </div>
              </div>

              {/* District */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">District</label>
                <select
                  name="district"
                  value={form.district}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow hover:shadow-sm bg-white"
                >
                  <option value="">Select district…</option>
                  {DISTRICTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <hr className="border-gray-100" />
              <p className="text-xs text-gray-400">Password update (optional)</p>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow hover:shadow-sm"
                />
              </div>

              {/* Confirm Password — only shown when a new password is typed */}
              {newPassword && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className={`w-full border rounded-xl px-4 py-3 text-gray-700 placeholder-gray-400 focus:ring-2 focus:border-transparent outline-none transition-shadow hover:shadow-sm ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-300 focus:ring-red-400'
                        : 'border-gray-200 focus:ring-indigo-500'
                    }`}
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-xs text-red-500 mt-1">Passwords don&apos;t match</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || success || (!!newPassword && newPassword !== confirmPassword)}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 hover:shadow-indigo-300/50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                  </span>
                ) : success ? '✓ Saved!' : 'Complete Setup'}
              </button>

            </form>
          </div>

        </div>
      </div>
    </div>
  )
}