import { supabaseAdmin } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { sessionId } = await request.json()

  // Deactivate all tokens for this session
  await supabaseAdmin.from('qr_tokens').update({ is_active: false }).eq('session_id', sessionId)

  const { error } = await supabaseAdmin.from('sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}