'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const FORM_DURATION = 300
const CACHE_KEY = 'sa_attendee_cache'

type PageState = 'loading' | 'valid' | 'qr_expired' | 'form_expired' | 'closed' | 'success' | 'duplicate'
interface SessionInfo { id: string; name: string; event_id: string }
interface EventInfo   { name: string; location: string }
interface FormData    { full_name: string; phone: string; email: string; institution: string; designation: string }

function loadCache(): FormData | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') } catch { return null }
}
function saveCache(d: FormData) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)) } catch {}
}
function fingerprint() {
  try { return btoa([navigator.userAgent, navigator.language, screen.width, screen.height].join('|')).slice(0, 64) }
  catch { return 'unknown' }
}
function pad(n: number) { return String(n).padStart(2, '0') }
function fmt(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}` }

function AttendForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [pageState,  setPageState]  = useState<PageState>('loading')
  const [session,    setSession]    = useState<SessionInfo | null>(null)
  const [event,      setEvent]      = useState<EventInfo | null>(null)
  const [timeLeft,   setTimeLeft]   = useState(FORM_DURATION)
  const [form,       setForm]       = useState<FormData>({ full_name: '', phone: '', email: '', institution: '', designation: '' })
  const [cached,     setCached]     = useState<FormData | null>(null)
  const [errors,     setErrors]     = useState<Partial<FormData>>({})
  const [submitting, setSubmitting] = useState(false)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(0)

  useEffect(() => {
    async function validate() {
      if (!token) { setPageState('qr_expired'); return }
      const { data: qr } = await supabase
        .from('qr_tokens')
        .select('session_id, expires_at, is_active')
        .eq('token', token)
        .single()

      if (!qr) { setPageState('qr_expired'); return }

      const { data: sess } = await supabase
        .from('sessions')
        .select('id, name, status, event_id')
        .eq('id', qr.session_id)
        .single()

      if (!sess)                    { setPageState('qr_expired'); return }
      if (sess.status === 'ended')  { setPageState('closed');     return }
      if (sess.status !== 'active') { setPageState('qr_expired'); return }

      // Token expiry is intentionally NOT checked here.
      // Session status is the sole gate — only admin ending the session closes it.

      setSession({ id: sess.id, name: sess.name, event_id: sess.event_id })

      const { data: ev } = await supabase
        .from('events').select('name, location').eq('id', sess.event_id).single()
      if (ev) setEvent(ev as EventInfo)

      const c = loadCache()
      if (c?.full_name) { setCached(c); setForm(c) }

      startedRef.current = Date.now()
      setPageState('valid')
    }
    validate()
  }, [token])

  useEffect(() => {
    if (pageState !== 'valid') {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedRef.current) / 1000)
      const left    = Math.max(0, FORM_DURATION - elapsed)
      setTimeLeft(left)
      if (left === 0) { clearInterval(timerRef.current!); setPageState('form_expired') }
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [pageState])

  function change(f: keyof FormData, v: string) {
    setForm(prev => ({ ...prev, [f]: v }))
    setErrors(prev => ({ ...prev, [f]: undefined }))
  }

  function validateForm(): boolean {
    const e: Partial<FormData> = {}
    if (!form.full_name.trim())  e.full_name = 'Full name is required'
    if (!form.phone.trim())      e.phone = 'Phone number is required'
    else if (!/^\+?[\d\s\-]{6,15}$/.test(form.phone.trim())) e.phone = 'Enter a valid phone number'
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    setErrors(e)
    return !Object.keys(e).length
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateForm() || !session) return
    if (timeLeft === 0) { setPageState('form_expired'); return }
    setSubmitting(true)

    // Re-check session is still active before submitting
    const { data: sess } = await supabase
      .from('sessions').select('status').eq('id', session.id).single()
    if (sess?.status !== 'active') { setSubmitting(false); setPageState('closed'); return }

    const { error } = await supabase.from('attendance_records').insert({
      session_id:         session.id,
      event_id:           session.event_id,
      full_name:          form.full_name.trim(),
      phone:              form.phone.trim(),
      email:              form.email.trim() || null,
      institution:        form.institution.trim() || null,
      designation:        form.designation.trim() || null,
      method:             'qr_scan',
      qr_token_used:      token,
      device_fingerprint: fingerprint(),
      status:             'verified',
    })

    setSubmitting(false)
    if (error) {
      if (error.code === '23505') { setPageState('duplicate'); return }
      setErrors({ full_name: error.message }); return
    }

    saveCache(form)
    setPageState('success')
  }

  const timerPct    = (timeLeft / FORM_DURATION) * 100
  const timerUrgent = timeLeft <= 60 && pageState === 'valid'
  const firstName   = form.full_name.split(' ')[0] || 'there'

  if (pageState === 'loading') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center text-white">
        <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-slate-400 text-sm">Validating QR code…</p>
      </div>
    </div>
  )

  if (pageState === 'qr_expired')   return <StatusScreen icon="⏱️" title="QR code expired"   message="This QR code is no longer valid. Please scan the latest code displayed at the venue." accent="amber" />
  if (pageState === 'form_expired') return <StatusScreen icon="⏳" title="Form timed out"    message="The 5-minute window has passed. Please scan the QR code again." accent="amber" />
  if (pageState === 'closed')       return <StatusScreen icon="🔒" title="Session closed"    message="This session has ended. The organiser is no longer accepting check-ins." accent="slate" />
  if (pageState === 'duplicate')    return <StatusScreen icon="✅" title="Already recorded"  message="Your attendance for this session is already saved." accent="green" />
  if (pageState === 'success')      return <StatusScreen icon="🎉" title={`You're checked in, ${firstName}!`} message="Your attendance has been recorded. You can close this page." accent="green" />

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* LEFT dark panel */}
      <div className="lg:w-[380px] lg:min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-indigo-950 flex flex-col px-8 py-10 text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-violet-700/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center justify-center text-xl">📋</div>
          <div>
            <p className="text-sm font-bold tracking-tight">Smart Attendance</p>
            <p className="text-xs text-slate-400">Secure check‑in</p>
          </div>
        </div>
        <div className="relative z-10 flex-1">
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">Checking in for</p>
          <h1 className="text-2xl font-bold leading-snug mb-2">{event?.name ?? 'Event'}</h1>
          <p className="text-slate-400 text-sm mb-1">{session?.name}</p>
          {event?.location && (
            <p className="text-slate-500 text-sm flex items-center gap-1.5 mt-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0L6.343 16.657a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {event.location}
            </p>
          )}
        </div>
        <div className={`relative z-10 mt-8 rounded-2xl p-5 border transition-colors ${timerUrgent ? 'bg-red-900/30 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-semibold uppercase tracking-wider ${timerUrgent ? 'text-red-400' : 'text-slate-400'}`}>
              {timerUrgent ? '⚠️  Expiring soon' : 'Form window'}
            </span>
            <span className={`text-3xl font-bold tabular-nums ${timerUrgent ? 'text-red-400' : 'text-white'}`}>{fmt(timeLeft)}</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${timerUrgent ? 'bg-red-500' : 'bg-indigo-400'}`} style={{ width: `${timerPct}%` }} />
          </div>
          <p className={`text-xs mt-2.5 ${timerUrgent ? 'text-red-400' : 'text-slate-500'}`}>Submit before this timer runs out.</p>
        </div>
      </div>

      {/* RIGHT form panel */}
      <div className="flex-1 bg-gray-50 flex items-center justify-center px-6 py-12 lg:py-16">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Your details</h2>
          <p className="text-sm text-gray-500 mb-7">Fields marked <span className="text-red-500">*</span> are required.</p>

          {cached?.full_name && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 mb-6 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-indigo-800">Welcome back, {cached.full_name.split(' ')[0]} 👋</p>
                <p className="text-xs text-indigo-500 mt-0.5">Your details are pre-filled — review and submit.</p>
              </div>
              <button type="button" onClick={() => { setCached(null); setForm({ full_name: '', phone: '', email: '', institution: '', designation: '' }) }}
                className="text-xs text-indigo-500 hover:text-indigo-700 underline shrink-0 mt-0.5">Not you?</button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Full name" required error={errors.full_name}>
              <input type="text" value={form.full_name} onChange={e => change('full_name', e.target.value)} placeholder="John Smith" autoComplete="name" className={inputCls(!!errors.full_name)} />
            </Field>
            <Field label="Phone number" required error={errors.phone}>
              <input type="tel" value={form.phone} onChange={e => change('phone', e.target.value)} placeholder="+232 76 000 000" autoComplete="tel" className={inputCls(!!errors.phone)} />
            </Field>
            <Field label="Email address" error={errors.email}>
              <input type="email" value={form.email} onChange={e => change('email', e.target.value)} placeholder="optional" autoComplete="email" className={inputCls(!!errors.email)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Institution">
                <input type="text" value={form.institution} onChange={e => change('institution', e.target.value)} placeholder="optional" className={inputCls(false)} />
              </Field>
              <Field label="Designation">
                <input type="text" value={form.designation} onChange={e => change('designation', e.target.value)} placeholder="optional" className={inputCls(false)} />
              </Field>
            </div>
            <button type="submit" disabled={submitting}
              className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl text-sm font-semibold hover:bg-indigo-700 active:scale-[0.99] transition-all disabled:opacity-50 shadow-lg shadow-indigo-200/60 mt-2">
              {submitting
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>Submitting…
                  </span>
                : 'Mark my attendance'}
            </button>
          </form>
          <p className="text-xs text-center text-gray-400 mt-5">Your details are stored securely and used only for this event&apos;s attendance records.</p>
        </div>
      </div>
    </div>
  )
}

// Suspense wrapper required by Next.js for useSearchParams
export default function AttendPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    }>
      <AttendForm />
    </Suspense>
  )
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
        <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
        </svg>{error}
      </p>}
    </div>
  )
}

function StatusScreen({ icon, title, message, accent }: { icon: string; title: string; message: string; accent: 'amber' | 'green' | 'slate' }) {
  const bg   = { amber: 'from-amber-900/40 to-slate-900', green: 'from-emerald-900/40 to-slate-900', slate: 'from-slate-800 to-slate-900' }[accent]
  const card = { amber: 'bg-amber-50 border-amber-100', green: 'bg-emerald-50 border-emerald-100', slate: 'bg-slate-50 border-slate-100' }[accent]
  return (
    <div className={`min-h-screen bg-gradient-to-b ${bg} flex items-center justify-center p-6`}>
      <div className={`${card} border rounded-3xl p-10 text-center max-w-sm w-full shadow-sm`}>
        <div className="text-5xl mb-5">{icon}</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

function inputCls(hasError: boolean) {
  return ['w-full border rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:ring-2 focus:border-transparent outline-none transition-shadow',
    hasError ? 'border-red-300 focus:ring-red-400 bg-red-50/50' : 'border-gray-200 focus:ring-indigo-500 bg-white hover:shadow-sm'].join(' ')
}