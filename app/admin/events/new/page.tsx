'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function CreateEventPage() {
  const [form, setForm] = useState({
    name: '',
    location: '',
    event_date: '',
    start_time: '',
    end_time: '',
    description: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: insertError } = await supabase.from('events').insert({
      ...form,
      created_by: user!.id,
    })
    if (insertError) {
      setError(insertError.message)
      setLoading(false)
    } else {
      router.push('/admin/events')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>New Event</h1>
      </div>
      <div className="card" style={{ maxWidth: 600 }}>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Event Name *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date *</label>
              <input type="date" className="input" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Location *</label>
              <input className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start Time *</label>
              <input type="time" className="input" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="time" className="input" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      </div>
    </div>
  )
}