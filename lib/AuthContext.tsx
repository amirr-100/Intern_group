'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// Match your actual profiles table shape
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
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch profile – if it fails, assume we need to re‑authenticate
  async function fetchProfile(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Profile fetch error:', error.message)
        return null
      }
      return data as Profile
    } catch (err: unknown) {
      console.error('Unexpected profile fetch error:', err)
      return null
    }
  }

  // Sign out – clear all state and redirect
  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err: unknown) {
      console.error('SignOut error:', err)
    } finally {
      window.location.href = '/login'
    }
  }

  useEffect(() => {
    let isMounted = true

    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (!isMounted) return

        if (error) {
          console.error('getSession error:', error.message)
          if (error.message.includes('Refresh Token')) {
            await signOut()
          }
          setLoading(false)
          return
        }

        const u = session?.user ?? null
        setUser(u)
        if (u) {
          const p = await fetchProfile(u.id)
          if (isMounted) setProfile(p)
        }
        setLoading(false)
      } catch (err: unknown) {
        console.error('Session init error:', err)
        if (isMounted) {
          if (err instanceof Error && err.message.includes('Refresh Token')) {
            await signOut()
          } else {
            setLoading(false)
          }
        }
      }
    }

    initSession()

    // Listen for future auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return

        if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'INITIAL_SESSION'
        ) {
          const u = session?.user ?? null
          setUser(u)
          if (u) {
            const p = await fetchProfile(u.id)
            if (isMounted) setProfile(p)
          } else {
            setProfile(null)
          }
          setLoading(false)
        }
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