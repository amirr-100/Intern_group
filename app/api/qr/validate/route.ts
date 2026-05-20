import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { token } = await request.json()
  const { data: qr } = await supabase
    .from('qr_tokens')
    .select('session_id, expires_at')
    .eq('token', token)
    .single()

  if (!qr || new Date(qr.expires_at) < new Date()) {
    return NextResponse.json({ valid: false }, { status: 400 })
  }
  const { data: session } = await supabase
    .from('sessions')
    .select('status')
    .eq('id', qr.session_id)
    .single()

  if (!session || session.status !== 'active') {
    return NextResponse.json({ valid: false }, { status: 400 })
  }
  return NextResponse.json({ valid: true, session_id: qr.session_id })
}