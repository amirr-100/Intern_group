export type UserRole = 'super_admin' | 'admin'
export type EventStatus = 'upcoming' | 'active' | 'completed' | 'archived'
export type SessionStatus = 'scheduled' | 'active' | 'paused' | 'ended'
export type AttendanceMethod = 'qr_scan' | 'manual' | 'paper_upload'
export type AttendanceStatus = 'verified' | 'pending' | 'duplicate'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  institution: string | null
  designation: string | null
  district: string | null
  role: UserRole
  is_first_login: boolean
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

export interface Event {
  id: string
  name: string
  location: string
  event_date: string
  start_time: string
  end_time: string | null
  description: string | null
  status: EventStatus
  is_archived: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  event_id: string
  name: string
  status: SessionStatus
  qr_refresh_interval: number
  allow_manual_entry: boolean
  duplicate_prevention: boolean
  form_expiry_seconds: number
  started_at: string | null
  ended_at: string | null
  created_by: string
  created_at: string
}

export interface QrToken {
  id: string
  session_id: string
  token: string
  generated_at: string
  expires_at: string
  is_active: boolean
  scan_count: number
}

export interface AttendanceRecord {
  id: string
  session_id: string
  event_id: string
  full_name: string
  phone: string
  email: string | null
  institution: string | null
  designation: string | null
  method: AttendanceMethod
  status: AttendanceStatus
  submitted_at: string
}

export interface EventSummary extends Event {
  admin_name: string | null
  total_sessions: number
  total_attendance: number
  verified_count: number
  duplicate_count: number
}

export interface SessionSummary extends Session {
  event_name: string
  total_checkins: number
  qr_scans: number
  manual_entries: number
  duplicates: number
}