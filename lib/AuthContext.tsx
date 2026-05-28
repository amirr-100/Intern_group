'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  institution: string | null
  designation: string | null
  district: string | null
  role: 'super_admin' | 'admin'
  is_first_login: boolean
  is_active: boolean
  avatar_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null, profile: null, loading: true, signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const loadingRef = useRef(true)
  const userRef    = useRef<User | null>(null)   // stable ref for visibility handler

  const setLoadingBoth = (val: boolean) => {
    loadingRef.current = val
    setLoading(val)
  }

  const signOut = async () => {
    await supabase.auth.signOut().catch(console.error)
    window.location.replace('/login')
  }

  useEffect(() => {
    let isMounted = true

    // Safety net: unblock UI if Supabase never responds (slow network / ad-blocker)
    const safetyTimer = setTimeout(() => {
      if (isMounted && loadingRef.current) {
        console.warn('AuthContext: timed out after 4 s — unblocking UI')
        setUser(null)
        userRef.current = null
        setProfile(null)
        setLoadingBoth(false)
      }
    }, 4000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return
        clearTimeout(safetyTimer)

        try {
          const u = session?.user ?? null
          setUser(u)
          userRef.current = u

          if (u) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', u.id)
              .maybeSingle()
            if (isMounted) setProfile(data as Profile | null)
          } else {
            setProfile(null)
          }
        } catch (err) {
          console.error('AuthContext profile fetch error:', err)
          if (isMounted) setProfile(null)
        } finally {
          if (isMounted) setLoadingBoth(false)
        }
      }
    )

    // ─────────────────────────────────────────────────────────────────────────
    // FIX: Re-validate the session whenever the tab becomes visible again.
    // This is the root cause of the "idle freeze" — after ~1 min of inactivity
    // the browser may suspend the tab, the Supabase WebSocket drops, and the
    // JWT token silently expires. When the user comes back the session is dead
    // but nothing triggered a re-check. This handler forces one.
    // ─────────────────────────────────────────────────────────────────────────
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible' || !isMounted) return

      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          // Session expired while idle — clear local state and go to login
          if (userRef.current) {
            setUser(null)
            userRef.current = null
            setProfile(null)
            window.location.replace('/login')
          }
          return
        }

        // Session is still valid — nothing to do (onAuthStateChange will fire
        // TOKEN_REFRESHED automatically if the token was silently refreshed)
      } catch {
        // Network error on re-focus — don't crash, just wait
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isMounted = false
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}