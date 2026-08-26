export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'RESPONDER' | 'WORKER'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  role: UserRole
  organization_id: string
  created_at: string
}

export interface Device {
  id: string
  organization_id: string
  device_code: string
  name: string | null
  status: string
  latitude: number | null
  longitude: number | null
  battery_level: number | null
  last_seen: string | null
  created_at: string
}

export interface Responder {
  id: string
  profile_id: string
  organization_id: string
  status: string
  latitude: number | null
  longitude: number | null
  specializations: string[] | null
  created_at: string
}

export interface SessionUser {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
  }
}
