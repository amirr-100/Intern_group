// app/api/sessions/end/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // 1. Deactivate all QR tokens for this session
    await supabaseAdmin
      .from('qr_tokens')
      .update({ is_active: false })
      .eq('session_id', sessionId)
      .eq('is_active', true)

    // 2. Mark session as ended
    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ status: 'ended', ended_at: now })
      .eq('id', sessionId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, ended_at: now })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}