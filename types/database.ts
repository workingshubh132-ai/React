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

export type IncidentType = 'FIRE' | 'MEDICAL' | 'GAS_LEAK' | 'ELECTRICAL' | 'ACCIDENT' | 'SECURITY' | 'OTHER'
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IncidentStatus = 'DETECTED' | 'VERIFYING' | 'VERIFIED' | 'DISPATCHED' | 'RESPONDING' | 'RESOLVED' | 'FALSE_ALARM'
export type EventType = 'INCIDENT_CREATED' | 'INCIDENT_VERIFICATION_STARTED' | 'INCIDENT_VERIFIED' | 'INCIDENT_MARKED_FALSE_ALARM' | 'INCIDENT_DISPATCHED' | 'RESPONDER_ACCEPTED' | 'RESPONDER_ARRIVED' | 'INCIDENT_RESOLVED'
export type ResponderAssignmentStatus = 'ASSIGNED' | 'ACCEPTED' | 'DECLINED' | 'ARRIVED' | 'COMPLETED'

// M3 — Signal Detection
export type SignalSource = 'MOBILE' | 'REACT_NODE' | 'DASHBOARD'
export type SignalType = 'SOS' | 'PANIC_BUTTON' | 'IMPACT' | 'SMOKE' | 'GAS' | 'TEMPERATURE' | 'MOTION' | 'MANUAL_REPORT' | 'UNKNOWN'
export type DetectionAction = 'INCIDENT_CANDIDATE' | 'MONITORING' | 'RECORD_ONLY' | 'DUPLICATE' | 'INVALID'

export interface Incident {
  id: string
  organization_id: string
  device_id: string | null
  reported_by: string | null
  incident_type: IncidentType
  severity: IncidentSeverity
  status: IncidentStatus
  title: string
  description: string | null
  latitude: number | null
  longitude: number | null
  detected_at: string
  verified_at: string | null
  dispatched_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface IncidentEvent {
  id: string
  incident_id: string
  organization_id: string
  event_type: EventType
  actor_id: string | null
  metadata: Record<string, any>
  created_at: string
}

export interface IncidentResponder {
  id: string
  incident_id: string
  responder_id: string
  organization_id: string
  status: ResponderAssignmentStatus
  assigned_at: string
  accepted_at: string | null
  arrived_at: string | null
  created_at: string
  updated_at: string
}

export interface SignalEvent {
  id: string
  organization_id: string
  device_id: string | null
  source: SignalSource
  signal_type: SignalType
  severity: IncidentSeverity
  confidence: number | null
  latitude: number | null
  longitude: number | null
  occurred_at: string
  metadata: Record<string, any>
  created_at: string
}

export interface SignalDetection {
  id: string
  signal_event_id: string
  organization_id: string
  action: DetectionAction
  severity: IncidentSeverity
  requires_verification: boolean
  reason: string
  confidence: number
  recommended_incident_type: IncidentType | null
  incident_id: string | null
  created_at: string
}
