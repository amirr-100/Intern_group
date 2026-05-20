'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ⚠️ Replace "your-project-ref" with your actual Supabase project reference
const EDGE_FUNCTION_URL =
  'https://fonxjkghoispmeiqezox.supabase.co/functions/v1/create-admin'

export default function CreateAdminPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (res.ok) {
        router.push('/admin/profiles')
      } else {
        setError(data.error || 'Failed to create admin account')
      }
    } catch {
      setError('Network error – please try again later')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Create Admin Account</h1>
      </div>
      <div className="card" style={{ maxWidth: 500 }}>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Admin'}
          </button>
        </form>
      </div>
    </div>
  )
}