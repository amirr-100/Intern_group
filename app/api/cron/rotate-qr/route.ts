import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // Delete expired tokens
  await supabase.from('qr_tokens').delete().lt('expires_at', new Date().toISOString())

  const { data: activeSessions } = await supabase
    .from('sessions')
    .select('id, qr_refresh_interval')
    .eq('status', 'active')

  if (!activeSessions?.length) {
    return NextResponse.json({ message: 'No active sessions' })
  }

  const tokens = activeSessions.map(s => ({
    session_id: s.id,
    token: crypto.randomUUID(),
    expires_at: new Date(Date.now() + (s.qr_refresh_interval + 2) * 1000).toISOString(),
    is_active: true,
  }))

  const { error } = await supabase.from('qr_tokens').insert(tokens)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, created: tokens.length })
}