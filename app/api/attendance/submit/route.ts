import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  return createClient(url, key)
}

export async function POST(request: Request) {
  const supabase = getSupabase()

  const { token, full_name, phone, email, institution, designation, fingerprint } = await request.json()

  const { data: qr } = await supabase
    .from('qr_tokens')
    .select('session_id, expires_at')
    .eq('token', token)
    .single()

  if (!qr || new Date(qr.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token expired or invalid' }, { status: 400 })
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('status, event_id')
    .eq('id', qr.session_id)
    .single()

  if (!session || session.status !== 'active') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
  }

  const { error } = await supabase.from('attendance_records').insert({
    session_id: qr.session_id,
    event_id: session.event_id,
    full_name,
    phone,
    email,
    institution,
    designation,
    method: 'qr_scan',
    qr_token_used: token,
    device_fingerprint: fingerprint,
  })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Duplicate submission' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
