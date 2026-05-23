'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import { supabase } from '@/lib/supabase'

function QRDisplay() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [attendUrl, setAttendUrl] = useState('')
  const [eventName, setEventName] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [valid, setValid] = useState(true)

  useEffect(() => {
    async function load() {
      if (!token) { setValid(false); return }
      const { data: qr } = await supabase
        .from('qr_tokens')
        .select('session_id, is_active')
        .eq('token', token)
        .single()

      if (!qr || !qr.is_active) { setValid(false); return }

      const { data: sess } = await supabase
        .from('sessions')
        .select('id, name, status, event_id')
        .eq('id', qr.session_id)
        .single()

      if (!sess || sess.status !== 'active') { setValid(false); return }

      const { data: ev } = await supabase
        .from('events')
        .select('name')
        .eq('id', sess.event_id)
        .single()

      setEventName(ev?.name ?? '')
      setSessionName(sess.name)
      setAttendUrl(`${window.location.origin}/attend?token=${token}`)
    }

    load()
  }, [token])

  if (!valid) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold mb-2">Session not active</h2>
          <p className="text-gray-400 text-sm">This QR code is no longer valid.</p>
        </div>
      </div>
    )
  }

  if (!attendUrl) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center px-6 py-10">
      {/* Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Logo */}
      <div className="flex items-center gap-3 mb-10 relative z-10">
        <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center justify-center text-xl">📋</div>
        <div>
          <p className="text-white text-sm font-bold tracking-tight">Smart Attendance</p>
          <p className="text-indigo-300 text-xs">Secure check-in</p>
        </div>
      </div>

      {/* Event info */}
      <div className="text-center mb-8 relative z-10">
        <p className="text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-2">Now accepting check-ins</p>
        <h1 className="text-white text-3xl font-bold mb-1">{eventName}</h1>
        <p className="text-slate-400 text-sm">{sessionName}</p>
      </div>

      {/* QR Code */}
      <div className="bg-white p-6 rounded-3xl shadow-2xl shadow-indigo-900/50 relative z-10 mb-8">
        <QRCode value={attendUrl} size={260} />
      </div>

      {/* Instructions */}
      <div className="text-center relative z-10 max-w-xs">
        <p className="text-slate-300 text-base font-medium mb-1">Scan to mark your attendance</p>
        <p className="text-slate-500 text-sm">Point your phone camera at the QR code above</p>
      </div>

      {/* Live indicator */}
      <div className="mt-8 flex items-center gap-2 relative z-10">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-green-400 text-xs font-medium">Live — accepting check-ins</span>
      </div>
    </div>
  )
}

export default function QRDisplayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    }>
      <QRDisplay />
    </Suspense>
  )
}