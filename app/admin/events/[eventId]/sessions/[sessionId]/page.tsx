'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import Link from 'next/link'

export default function LiveSessionPage() {
  const { eventId, sessionId } = useParams<{ eventId: string; sessionId: string }>()
  const [session, setSession] = useState<any>(null)
  const [currentToken, setCurrentToken] = useState('')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchSession = async () => {
    const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
    setSession(data)
  }

  useEffect(() => {
    fetchSession()
  }, [sessionId])

  const generateToken = async () => {
    const res = await fetch('/api/qr/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    const data = await res.json()
    if (data.token) setCurrentToken(data.token)
  }

  useEffect(() => {
    if (session?.status === 'active') {
      generateToken()
      intervalRef.current = setInterval(generateToken, (session.qr_refresh_interval || 10) * 1000)
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }
  }, [session?.status])

  const startSession = async () => {
    await supabase
      .from('sessions')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', sessionId)
    fetchSession()
  }

  const endSession = async () => {
    await fetch('/api/sessions/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    fetchSession()
  }

  if (!session) return <div>Loading...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{session.name}</h1>
          <p className="flex-center gap-2">
            Status: <span className={`badge ${session.status}`}>{session.status}</span>
          </p>
        </div>
        <div className="flex-center gap-2">
          <Link href={`/admin/events/${eventId}/sessions/${sessionId}/attendance`} className="btn btn-ghost">
            View Attendance
          </Link>
          {session.status === 'scheduled' && (
            <button className="btn btn-green" onClick={startSession}>
              Start Session
            </button>
          )}
          {session.status === 'active' && (
            <button className="btn btn-danger" onClick={endSession}>
              End Session
            </button>
          )}
        </div>
      </div>

      {session.status === 'active' && currentToken && (
        <div className="card mb-4">
          <div className="card-header">
            <h2>Live QR Code</h2>
            <div className="live-pill">
              <span className="live-dot"></span> Live
            </div>
          </div>
          <div className="qr-box">
            <QRCode value={`${window.location.origin}/qr/${currentToken}`} size={200} />
          </div>
          <div className="progress-bar" style={{ marginTop: 10 }}>
            <div
              className="progress"
              style={{
                width: `${(100 * (15 - ((Date.now() - new Date(session.started_at).getTime()) / 1000) % 15)) / 15}%`,
              }}
            ></div>
          </div>
          <p className="text-muted mt-4" style={{ textAlign: 'center' }}>
            QR refreshes every {session.qr_refresh_interval}s
          </p>
        </div>
      )}
    </div>
  )
}