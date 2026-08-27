import type { SignalSource, SignalType, IncidentSeverity } from '@/types/database'

export interface RawSignalInput {
  source: unknown
  signal_type: unknown
  severity: unknown
  confidence?: unknown
  latitude?: unknown
  longitude?: unknown
  occurred_at: unknown
  device_id?: unknown
  metadata?: unknown
}

export interface NormalizedSignal {
  source: SignalSource
  signal_type: SignalType
  severity: IncidentSeverity
  confidence: number | null
  latitude: number | null
  longitude: number | null
  occurred_at: Date
  device_id: string | null
  metadata: Record<string, any>
}

export interface ValidationResult {
  valid: boolean
  signal?: NormalizedSignal
  errors: string[]
}

const VALID_SOURCES: SignalSource[] = ['MOBILE', 'REACT_NODE', 'DASHBOARD']
const VALID_SIGNAL_TYPES: SignalType[] = [
  'SOS',
  'PANIC_BUTTON',
  'IMPACT',
  'SMOKE',
  'GAS',
  'TEMPERATURE',
  'MOTION',
  'MANUAL_REPORT',
  'UNKNOWN',
]
const VALID_SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

function isValidTimestamp(value: unknown): boolean {
  if (typeof value === 'string') {
    const timestamp = new Date(value)
    return !isNaN(timestamp.getTime())
  }
  if (typeof value === 'number') {
    const timestamp = new Date(value)
    return !isNaN(timestamp.getTime()) && timestamp.getTime() > 0
  }
  return false
}

function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return true
  }

  const latitude = typeof lat === 'number' ? lat : parseFloat(String(lat))
  const longitude = typeof lng === 'number' ? lng : parseFloat(String(lng))

  return (
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

function isValidConfidence(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }

  const confidence = typeof value === 'number' ? value : parseFloat(String(value))
  return !isNaN(confidence) && confidence >= 0 && confidence <= 1
}

function estimatePayloadSize(obj: any): number {
  return JSON.stringify(obj).length
}

export function validateSignal(input: RawSignalInput): ValidationResult {
  const errors: string[] = []

  if (!input.source || !VALID_SOURCES.includes(input.source as SignalSource)) {
    errors.push(`Invalid source: ${input.source}. Must be one of: ${VALID_SOURCES.join(', ')}`)
  }

  if (!input.signal_type || !VALID_SIGNAL_TYPES.includes(input.signal_type as SignalType)) {
    errors.push(
      `Invalid signal_type: ${input.signal_type}. Must be one of: ${VALID_SIGNAL_TYPES.join(', ')}`
    )
  }

  if (!input.severity || !VALID_SEVERITIES.includes(input.severity as IncidentSeverity)) {
    errors.push(`Invalid severity: ${input.severity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`)
  }

  if (!isValidTimestamp(input.occurred_at)) {
    errors.push(`Invalid occurred_at: must be a valid ISO 8601 timestamp`)
  }

  if (!isValidConfidence(input.confidence)) {
    errors.push(`Invalid confidence: must be a number between 0 and 1`)
  }

  if (!isValidCoordinate(input.latitude, input.longitude)) {
    errors.push(`Invalid coordinates: latitude must be -90 to 90, longitude must be -180 to 180`)
  }

  if (input.device_id !== undefined && input.device_id !== null) {
    if (!isValidUUID(input.device_id)) {
      errors.push(`Invalid device_id: must be a valid UUID`)
    }
  }

  if (input.metadata !== undefined && input.metadata !== null) {
    if (typeof input.metadata !== 'object' || Array.isArray(input.metadata)) {
      errors.push(`Invalid metadata: must be a JSON object`)
    } else {
      const size = estimatePayloadSize(input.metadata)
      if (size > 10000) {
        errors.push(`Metadata too large: ${size} bytes (max 10000)`)
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  const normalizedSignal: NormalizedSignal = {
    source: input.source as SignalSource,
    signal_type: input.signal_type as SignalType,
    severity: input.severity as IncidentSeverity,
    confidence: input.confidence ? parseFloat(String(input.confidence)) : null,
    latitude: input.latitude ? parseFloat(String(input.latitude)) : null,
    longitude: input.longitude ? parseFloat(String(input.longitude)) : null,
    occurred_at: new Date(String(input.occurred_at)),
    device_id: input.device_id ? String(input.device_id) : null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  }

  return { valid: true, signal: normalizedSignal, errors: [] }
}
