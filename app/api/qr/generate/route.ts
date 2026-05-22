// app/api/qr/generate/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Use service role so we can deactivate old tokens and insert new ones server-side
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const QR_REFRESH_DEFAULT = 10 // seconds

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    // Verify session is still active
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('sessions')
      .select('id, status, qr_refresh_interval')
      .eq('id', sessionId)
      .single()

    if (sessErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
    }

    const refreshInterval = session.qr_refresh_interval ?? QR_REFRESH_DEFAULT

    // Deactivate all previous tokens for this session
    await supabaseAdmin
      .from('qr_tokens')
      .update({ is_active: false })
      .eq('session_id', sessionId)
      .eq('is_active', true)

    // Generate a new token
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + refreshInterval * 1000).toISOString()

    const { error: insertErr } = await supabaseAdmin
      .from('qr_tokens')
      .insert({
        session_id: sessionId,
        token,
        expires_at: expiresAt,
        is_active: true,
        generated_at: new Date().toISOString(),
      })

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ token, expires_at: expiresAt })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}