'use server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function createAdminAccount(email: string, password: string) {
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin' },
  })
  if (error) throw error
}