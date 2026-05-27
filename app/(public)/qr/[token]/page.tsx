'use client'
import { useParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'valid' | 'expired' | 'success' | 'duplicate' | 'closed'

interface AttendanceForm {
  full_name: string
  phone: string
  email: string
  institution: string
  designation: string
}

interface SessionData {
  id: string
  name: string
  status: string
  event_id: string
  qr_refresh_interval: number
}

interface EventData {
  name: string
  location: string
}

const CACHE_KEY = 'attendance_cache'

function getCache(): AttendanceForm | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as AttendanceForm) : null
  } catch {
    return null
  }
}

function saveCache(data: AttendanceForm) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {}
}

function getFingerprint(): string {
  try {
    return btoa(
      [navigator.userAgent, navigator.language, screen.width, screen.height].join('|')
    ).slice(0, 64)
  } catch {
    return 'unknown'
  }
}

const GRACE_MS = 30_000

export default function QRScanPage() {
  const { token } = useParams<{ token: string }>()
  const [session, setSession]       = useState<SessionData | null>(null)
  const [event, setEvent]           = useState<EventData | null>(null)
  const [status, setStatus]         = useState<Status>('loading')
  const [cachedData, setCachedData] = useState<AttendanceForm | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<Partial<AttendanceForm>>({})
  const [duplicateName, setDuplicateName] = useState<string>('')
  const [form, setForm] = useState<AttendanceForm>({
    full_name: '', phone: '', email: '', institution: '', designation: '',
  })
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Validate token on mount ──────────────────────────────────────────────
  useEffect(() => {
    const validate = async () => {
      // Token check now inside the async fn — no synchronous setState in effect body
      if (!token) { setStatus('expired'); return }

      try {
        const { data: qr } = await supabase
          .from('qr_tokens')
          .select('session_id, expires_at, is_active')
          .eq('token', token)
          .maybeSingle()

        const tokenExpiry = qr ? new Date(qr.expires_at).getTime() : 0
        const isTokenValid = qr && qr.is_active && (tokenExpiry + GRACE_MS) > Date.now()

        if (!isTokenValid) { setStatus('expired'); return }

        const { data: sess } = await supabase
          .from('sessions')
          .select('id, name, status, event_id, qr_refresh_interval')
          .eq('id', qr.session_id)
          .maybeSingle()

        if (!sess)                    { setStatus('expired'); return }
        if (sess.status === 'ended')  { setStatus('closed');  return }
        if (sess.status !== 'active' && sess.status !== 'paused') {
          setStatus('expired'); return
        }

        setSession(sess as SessionData)

        const { data: ev } = await supabase
          .from('events')
          .select('name, location')
          .eq('id', sess.event_id)
          .maybeSingle()
        if (ev) setEvent(ev as EventData)

        const cached = getCache()
        if (cached?.full_name) {
          setCachedData(cached)
          setForm(cached)
        }

        setStatus('valid')

        const msLeft = tokenExpiry + GRACE_MS - Date.now()
        if (msLeft > 0) {
          expiryRef.current = setTimeout(() => setStatus('expired'), msLeft)
        }
      } catch (err) {
        console.error('QR validation error:', err)
        setStatus('expired')
      }
    }

    validate()
    return () => { if (expiryRef.current) clearTimeout(expiryRef.current) }
  }, [token])

  // ── Form helpers ─────────────────────────────────────────────────────────
  const update = (field: keyof AttendanceForm, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
    setFieldError(e => ({ ...e, [field]: undefined }))
  }

  const validateForm = (): boolean => {
    const errs: Partial<AttendanceForm> = {}
    if (!form.full_name.trim()) errs.full_name = 'Full name is required'
    if (!form.phone.trim())     errs.phone = 'Phone number is required'
    else if (!/^\+?[\d\s\-]{7,15}$/.test(form.phone.trim()))
      errs.phone = 'Enter a valid phone number'
    if (form.email && !/\S+@\S+\.\S+/.test(form.email))
      errs.email = 'Enter a valid email address'
    setFieldError(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm() || !session) return
    setSubmitting(true)

    try {
      // ── Step 1: Check by phone if this person already submitted for this session ──
      // This is the primary duplicate gate — phone number is the identity.
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id, full_name')
        .eq('session_id', session.id)
        .eq('phone', form.phone.trim())
        .maybeSingle()

      if (existing) {
        // They already submitted — block immediately, no insert attempted
        setDuplicateName(existing.full_name ?? form.full_name)
        setStatus('duplicate')
        return
      }

      // ── Step 2: Re-confirm session is still active before inserting ──
      const { data: liveSession } = await supabase
        .from('sessions')
        .select('status')
        .eq('id', session.id)
        .maybeSingle()

      if (liveSession?.status !== 'active') {
        setStatus('closed')
        return
      }

      // ── Step 3: Insert attendance record ──
      const { error: submitError } = await supabase
        .from('attendance_records')
        .insert({
          session_id:         session.id,
          event_id:           session.event_id,
          full_name:          form.full_name.trim(),
          phone:              form.phone.trim(),
          email:              form.email.trim() || null,
          institution:        form.institution.trim() || null,
          designation:        form.designation.trim() || null,
          method:             'qr_scan',
          qr_token_used:      token,
          device_fingerprint: getFingerprint(),
          status:             'verified',
        })

      if (submitError) {
        // DB unique constraint fallback (race condition safety net)
        if (
          submitError.code === '23505' ||
          submitError.message.toLowerCase().includes('duplicate')
        ) {
          setDuplicateName(form.full_name)
          setStatus('duplicate')
          return
        }
        if (
          submitError.code === '42501' ||
          submitError.message.toLowerCase().includes('policy')
        ) {
          setStatus('expired')
          return
        }
        setFieldError({ full_name: submitError.message })
        return
      }

      saveCache(form)
      setStatus('success')
    } catch (err) {
      console.error('Submit error:', err)
      setFieldError({ full_name: 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Status screens ────────────────────────────────────────────────────────
  if (status === 'loading') return (
    <Page>
      <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
        <Spinner />
        <p className="text-sm">Validating QR code…</p>
      </div>
    </Page>
  )

  if (status === 'expired') return (
    <Page>
      <Card bg="bg-amber-50" icon={<ClockIcon />}
        title="QR code expired"
        message="This code is no longer valid. Please scan the latest QR code displayed on the screen." />
    </Page>
  )

  if (status === 'closed') return (
    <Page>
      <Card bg="bg-gray-50" icon={<BlockIcon />}
        title="Session closed"
        message="This session has ended. Attendance is no longer being accepted." />
    </Page>
  )

  if (status === 'success') return (
    <Page>
      <Card bg="bg-green-50" icon={<CheckIcon />}
        title="Attendance recorded"
        message={`Thank you, ${form.full_name}! Your attendance has been saved successfully.`} />
    </Page>
  )

  if (status === 'duplicate') return (
    <Page>
      <div className="bg-orange-50 rounded-2xl px-5 py-8 text-center flex flex-col items-center gap-3">
        <WarnIcon />
        <h2 className="text-base font-bold text-gray-900">Already submitted</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          <strong>{duplicateName || form.full_name}</strong>, your attendance for this session
          has already been recorded. You cannot submit again for the same session.
        </p>
        <div className="mt-2 bg-orange-100 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-700 text-left w-full">
          If you believe this is an error, please speak to the session organiser.
        </div>
      </div>
    </Page>
  )

  // ── Attendance form ───────────────────────────────────────────────────────
  return (
    <Page>
      {/* Event / session header */}
      <div className="text-center mb-6 px-2">
        <h1 className="text-xl font-bold text-gray-900 leading-snug">
          {event?.name ?? 'Attendance'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{session?.name}</p>
        {event?.location && (
          <p className="text-xs text-gray-400 mt-0.5 flex items-center justify-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0L6.343 16.657a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {event.location}
          </p>
        )}
      </div>

      {/* Returning-user banner */}
      {cachedData?.full_name && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-800">
              Welcome back, {cachedData.full_name.split(' ')[0]}
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">
              Your details are filled in. Review and submit.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCachedData(null)
              setForm({ full_name: '', phone: '', email: '', institution: '', designation: '' })
            }}
            className="text-xs text-indigo-500 hover:text-indigo-700 underline shrink-0 mt-0.5"
          >
            Not you?
          </button>
        </div>
      )}

      {/*
        iOS Safari autofill requires BOTH name="" and autoComplete="" to be present.
        Use standard HTML autocomplete token values so the browser can match them.
      */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate autoComplete="on">

        <Field label="Full name" required error={fieldError.full_name}>
          <input
            type="text"
            name="name"
            autoComplete="name"
            value={form.full_name}
            onChange={e => update('full_name', e.target.value)}
            placeholder="John Smith"
            className={inputCls(!!fieldError.full_name)}
          />
        </Field>

        <Field label="Phone number" required error={fieldError.phone}>
          <input
            type="tel"
            name="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={e => update('phone', e.target.value)}
            placeholder="+232 76 000 000"
            className={inputCls(!!fieldError.phone)}
          />
        </Field>

        <Field label="Email address" error={fieldError.email}>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            placeholder="optional"
            className={inputCls(!!fieldError.email)}
          />
        </Field>

        <Field label="Institution / Organisation">
          <input
            type="text"
            name="organization"
            autoComplete="organization"
            value={form.institution}
            onChange={e => update('institution', e.target.value)}
            placeholder="optional"
            className={inputCls(false)}
          />
        </Field>

        <Field label="Designation / Role">
          <input
            type="text"
            name="organization-title"
            autoComplete="organization-title"
            value={form.designation}
            onChange={e => update('designation', e.target.value)}
            placeholder="optional"
            className={inputCls(false)}
          />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 text-white py-3 rounded-2xl text-sm font-semibold hover:bg-indigo-700 active:scale-[0.99] transition-all disabled:opacity-50 mt-2 shadow-sm"
        >
          {submitting
            ? <span className="flex items-center justify-center gap-2">
                <Spinner />Submitting…
              </span>
            : 'Submit attendance'}
        </button>
      </form>

      <p className="text-xs text-center text-gray-400 mt-5">
        Each phone number can only be submitted once per session.
      </p>
    </Page>
  )
}

// ── Layout & shared components ────────────────────────────────────────────────

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-gray-200 px-6 py-7">
        {children}
      </div>
    </div>
  )
}

function Card({ bg, icon, title, message }: {
  bg: string; icon: React.ReactNode; title: string; message: string
}) {
  return (
    <div className={`${bg} rounded-2xl px-5 py-8 text-center flex flex-col items-center gap-3`}>
      {icon}
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
    </div>
  )
}

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
          <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function BlockIcon() {
  return (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function inputCls(hasError: boolean) {
  return [
    'w-full border rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400',
    'focus:ring-2 focus:border-transparent outline-none transition',
    hasError
      ? 'border-red-300 focus:ring-red-400 bg-red-50'
      : 'border-gray-300 focus:ring-indigo-500',
  ].join(' ')
}