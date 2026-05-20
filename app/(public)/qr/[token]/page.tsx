'use client'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function QRScanPage() {
  const { token } = useParams<{ token: string }>()
  const [session, setSession] = useState<any>(null)
  const [event, setEvent] = useState<any>(null)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', institution: '', designation: '' })
  const [status, setStatus] = useState<'loading' | 'valid' | 'expired' | 'success' | 'duplicate'>('loading')
  const [savedData, setSavedData] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const validate = async () => {
      const { data: qr } = await supabase
        .from('qr_tokens')
        .select('session_id, expires_at')
        .eq('token', token)
        .single()
      if (!qr || new Date(qr.expires_at) < new Date()) {
        setStatus('expired'); return
      }
      const { data: sess } = await supabase.from('sessions').select('*').eq('id', qr.session_id).single()
      if (!sess || sess.status !== 'active') {
        setStatus('expired'); return
      }
      setSession(sess)
      const { data: ev } = await supabase.from('events').select('*').eq('id', sess.event_id).single()
      setEvent(ev)
      // load cached data from localStorage
      const cached = localStorage.getItem('attendance_cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        setSavedData(parsed)
        setForm(parsed)
      }
      setStatus('valid')
    }
    validate()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session) return
    const fingerprint = btoa(navigator.userAgent) // simple fingerprint
    const { data, error: submitError } = await supabase.from('attendance_records').insert({
      session_id: session.id,
      event_id: session.event_id,
      full_name: form.full_name,
      phone: form.phone,
      email: form.email || null,
      institution: form.institution || null,
      designation: form.designation || null,
      method: 'qr_scan',
      qr_token_used: token,
      device_fingerprint: fingerprint,
    }).select().single()
    if (submitError) {
      if (submitError.message.includes('duplicate')) setStatus('duplicate')
      else setError(submitError.message)
    } else {
      localStorage.setItem('attendance_cache', JSON.stringify(form))
      setStatus('success')
    }
  }

  if (status === 'loading') return <div className="flex-center min-h-screen">Validating QR...</div>
  if (status === 'expired') return (
    <div className="attendance-page">
      <div className="expired-state">
        <h2>QR Code Expired</h2>
        <p>Please scan the latest QR code on the screen.</p>
      </div>
    </div>
  )
  if (status === 'success') return (
    <div className="attendance-page">
      <div className="success-state">
        <h2>✅ Attendance Recorded</h2>
        <p>Thank you, {form.full_name}!</p>
      </div>
    </div>
  )
  if (status === 'duplicate') return (
    <div className="attendance-page">
      <div className="expired-state">
        <h2>Duplicate Entry</h2>
        <p>You have already submitted attendance for this session.</p>
      </div>
    </div>
  )

  return (
    <div className="attendance-page">
      <div className="attendance-header">
        <h1>{event?.name}</h1>
        <p>{session?.name} · 📍 {event?.location}</p>
      </div>
      {savedData && (
        <div className="welcome-back">
          👋 Welcome back, {savedData.full_name}!
        </div>
      )}
      <div className="attendance-card">
        <h2 style={{ marginBottom: 16 }}>Submit Attendance</h2>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name *</label>
            <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Phone *</label>
            <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Institution</label>
            <input className="input" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input className="input" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary w-full">Submit</button>
        </form>
      </div>
    </div>
  )
}