'use client'
import { createContext, useContext, useEffect, useState } from 'react'
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

  const signOut = async () => {
    await supabase.auth.signOut().catch(console.error)
    window.location.replace('/login')
  }

  useEffect(() => {
    let isMounted = true

    // onAuthStateChange fires INITIAL_SESSION immediately on mount —
    // no need for a separate getSession() call (that was the double-fetch).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return

        if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        const u = session?.user ?? null
        setUser(u)

        if (u) {
          // Use .maybeSingle() so missing profile doesn't throw
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', u.id)
            .maybeSingle()
          if (isMounted) setProfile(data as Profile | null)
        } else {
          setProfile(null)
        }

        if (isMounted) setLoading(false)
      }
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}