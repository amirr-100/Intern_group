'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'

export default function FirstLoginPage() {
  const { profile, user } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    institution: '',
    designation: '',
    district: '',
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (profile && !profile.is_first_login) {
      router.push('/admin/dashboard')
    }
  }, [profile, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (newPassword) {
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }
      const { error: pwError } = await supabase.auth.updateUser({ password: newPassword })
      if (pwError) {
        setError(pwError.message)
        setLoading(false)
        return
      }
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        ...form,
        is_first_login: false,
      })
      .eq('id', user.id)

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
    } else {
      router.push('/admin/dashboard')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Complete your profile</h2>
        <p className="subtitle">This is your first login. Please set up your details.</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name *</label>
            <input name="full_name" className="input" onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input name="phone" className="input" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Institution</label>
            <input name="institution" className="input" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input name="designation" className="input" onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>District</label>
            <input name="district" className="input" onChange={handleChange} />
          </div>
          <hr className="divider" />
          <p className="text-muted mb-4">Optionally change your password:</p>
          <div className="form-group">
            <label>New Password</label>
            <input type="password" className="input" onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input type="password" className="input" onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Saving...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  )
}