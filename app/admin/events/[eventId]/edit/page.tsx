'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import type { Event } from '@/types/database'

export default function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const [form, setForm] = useState<Partial<Event>>({})
  const router = useRouter()

  useEffect(() => {
    supabase.from('events').select('*').eq('id', eventId).single().then(({ data }) => {
      if (data) setForm(data)
    })
  }, [eventId])

  const handleSave = async () => {
    const { error } = await supabase.from('events').update(form).eq('id', eventId)
    if (!error) router.push(`/admin/events/${eventId}`)
    else alert(error.message)
  }

  return (
    <div>
      <div className="page-header"><h1>Edit Event</h1></div>
      <div className="card" style={{ maxWidth: 600 }}>
        <div className="form-group">
          <label>Name</label>
          <input className="input" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Location</label>
          <input className="input" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="input" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <button onClick={handleSave} className="btn btn-primary">Save Changes</button>
      </div>
    </div>
  )
}