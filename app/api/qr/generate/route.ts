import { supabaseAdmin } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { sessionId } = await request.json()

  // Clean expired tokens
  await supabaseAdmin.from('qr_tokens').delete().lt('expires_at', new Date().toISOString())

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15_000).toISOString()

  const { error } = await supabaseAdmin.from('qr_tokens').insert({
    session_id: sessionId,
    token,
    expires_at: expiresAt,
    is_active: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token, expiresAt })
}