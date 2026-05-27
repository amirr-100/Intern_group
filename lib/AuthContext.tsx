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

  // Ref tracks real loading state so the safety timer closure is never stale
  const loadingRef = useRef(true)

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

    // Safety net: if onAuthStateChange never fires within 8 s (slow network,
    // ad-blocker, Supabase cold start) we unblock the UI instead of hanging forever.
    const safetyTimer = setTimeout(() => {
      if (isMounted && loadingRef.current) {
        console.warn('AuthContext: timed out after 8 s — unblocking UI')
        setUser(null)
        setProfile(null)
        setLoadingBoth(false)
      }
    }, 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return

        // Auth responded — cancel the safety timer
        clearTimeout(safetyTimer)

        try {
          if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
            setUser(null)
            setProfile(null)
            return
          }

          const u = session?.user ?? null
          setUser(u)

          if (u) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', u.id)
              .maybeSingle()                    // never throws on missing row
            if (isMounted) setProfile(data as Profile | null)
          } else {
            setProfile(null)
          }
        } catch (err) {
          console.error('AuthContext profile fetch error:', err)
          if (isMounted) setProfile(null)
        } finally {
          // Always unblock the UI, even on errors
          if (isMounted) setLoadingBoth(false)
        }
      }
    )

    return () => {
      isMounted = false
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}