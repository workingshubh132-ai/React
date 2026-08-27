import { SupabaseClient } from '@supabase/supabase-js'
import type { SignalEvent, SignalDetection } from '@/types/database'
import { validateSignal, type RawSignalInput, type NormalizedSignal } from './validation'
import { detectFromSignal, type DetectionResult } from './detection'
import { checkDuplicate, updateDeduplicationState } from './deduplication'
import {
  getCorrelationWindowMs,
  findActiveIncidentForCorrelation,
  canCorrelateSignal,
  correlateSignalToIncident,
} from './correlation'
import { createIncident } from '@/lib/incidents'

export interface CreateSignalParams {
  organization_id: string
  source: string
  signal_type: string
  severity: string
  device_id?: string | null
  confidence?: number | null
  latitude?: number | null
  longitude?: number | null
  occurred_at: string | number
  metadata?: Record<string, any>
}

export interface SignalProcessingResult {
  signal: SignalEvent
  detection: SignalDetection
  incident_id?: string
  error?: string
}

/**
 * Verify device belongs to organization.
 * Do NOT trust client-provided organization_id.
 * Return the device's organization_id to verify authorization.
 */
async function authorizeDevice(
  supabase: SupabaseClient,
  device_id: string | null
): Promise<{ authorized: boolean; organization_id?: string; error?: string }> {
  if (!device_id) {
    // No device — will be validated by RLS on insert
    return { authorized: true }
  }

  const { data: device, error } = await supabase
    .from('devices')
    .select('id, organization_id')
    .eq('id', device_id)
    .single()

  if (error) {
    return { authorized: false, error: `Device not found: ${error.message}` }
  }

  if (!device) {
    return { authorized: false, error: 'Device not found' }
  }

  return { authorized: true, organization_id: device.organization_id }
}

/**
 * Process incoming signal: validate, deduplicate, detect, and create incident candidate.
 */
export async function processSignal(
  supabase: SupabaseClient,
  params: CreateSignalParams,
  authenticated_user_organization_id: string
): Promise<{ success: boolean; data?: SignalProcessingResult; error?: string }> {
  try {
    // 1. VALIDATE signal payload
    const rawInput: RawSignalInput = {
      source: params.source,
      signal_type: params.signal_type,
      severity: params.severity,
      confidence: params.confidence,
      latitude: params.latitude,
      longitude: params.longitude,
      occurred_at: params.occurred_at,
      device_id: params.device_id,
      metadata: params.metadata,
    }

    const validation = validateSignal(rawInput)
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join('; ')}`,
      }
    }

    const signal = validation.signal!

    // 2. AUTHORIZE device (if provided)
    if (signal.device_id) {
      const deviceAuth = await authorizeDevice(supabase, signal.device_id)
      if (!deviceAuth.authorized) {
        return { success: false, error: deviceAuth.error }
      }

      // Verify device organization matches request organization
      if (
        deviceAuth.organization_id &&
        deviceAuth.organization_id !== authenticated_user_organization_id
      ) {
        return {
          success: false,
          error: 'Device does not belong to your organization',
        }
      }
    }

    // Use authenticated user's organization (not client-provided)
    const organization_id = authenticated_user_organization_id

    // 3. CHECK for duplicates
    const dedupDecision = await checkDuplicate(
      supabase,
      organization_id,
      signal.device_id,
      signal.signal_type,
      signal.occurred_at
    )

    // 4. RUN detection rules
    const detection = detectFromSignal(signal)

    // 5. PERSIST signal event
    const { data: signalData, error: signalError } = await supabase
      .from('signal_events')
      .insert({
        organization_id,
        device_id: signal.device_id,
        source: signal.source,
        signal_type: signal.signal_type,
        severity: signal.severity,
        confidence: signal.confidence,
        latitude: signal.latitude,
        longitude: signal.longitude,
        occurred_at: signal.occurred_at.toISOString(),
        metadata: signal.metadata,
      })
      .select()
      .single()

    if (signalError) {
      return { success: false, error: `Failed to persist signal: ${signalError.message}` }
    }

    const signalEvent = signalData as SignalEvent

    // 6. Update deduplication state
    await updateDeduplicationState(
      supabase,
      organization_id,
      signal.device_id,
      signal.signal_type,
      signalEvent.id,
      signal.occurred_at,
      dedupDecision.is_duplicate
    )

    // 7. ADJUST detection if duplicate
    let finalAction = detection.action
    let finalReason = detection.reason

    if (dedupDecision.is_duplicate) {
      // Duplicates become monitoring unless already INCIDENT_CANDIDATE
      if (finalAction === 'INCIDENT_CANDIDATE') {
        finalAction = 'MONITORING'
      }
      finalReason = `${detection.reason} — Duplicate: ${dedupDecision.reason}`
    }

    // 8. CREATE detection record
    const { data: detectionData, error: detectionError } = await supabase
      .from('signal_detections')
      .insert({
        signal_event_id: signalEvent.id,
        organization_id,
        action: finalAction,
        severity: detection.severity,
        requires_verification: detection.requires_verification,
        reason: finalReason,
        confidence: detection.confidence,
        recommended_incident_type: detection.recommended_incident_type,
        incident_id: null,
      })
      .select()
      .single()

    if (detectionError) {
      return { success: false, error: `Failed to record detection: ${detectionError.message}` }
    }

    const detectionRecord = detectionData as SignalDetection

    // 9. ATTEMPT CORRELATION or CREATE incident candidate
    let incident_id: string | undefined

    if (finalAction === 'INCIDENT_CANDIDATE') {
      // Try to correlate to existing active incident
      const correlationWindowMs = await getCorrelationWindowMs(supabase)
      const activeIncidentResult = await findActiveIncidentForCorrelation(
        supabase,
        organization_id,
        correlationWindowMs
      )

      if (!activeIncidentResult.error && activeIncidentResult.incident_id && activeIncidentResult.incident_status) {
        // Check if this signal can be correlated to the active incident
        const correlationCheck = canCorrelateSignal(signal.signal_type, activeIncidentResult.incident_status)

        if (correlationCheck.can_correlate) {
          // Correlate to existing incident instead of creating a new one
          incident_id = activeIncidentResult.incident_id

          const correlationResult = await correlateSignalToIncident(
            supabase,
            organization_id,
            signalEvent.id,
            incident_id,
            correlationCheck.reason
          )

          if (correlationResult.success) {
            // Update detection record with incident reference
            await supabase
              .from('signal_detections')
              .update({ incident_id })
              .eq('id', detectionRecord.id)

            // Log correlation
            console.log(`Signal correlated to incident ${incident_id}: ${correlationCheck.reason}`)
          } else {
            // Correlation failed — continue to create new incident
            console.warn('Correlation failed, creating new incident:', correlationResult.error)
            incident_id = undefined
          }
        }
      }

      // If no correlation, create new incident
      if (!incident_id) {
        const incidentResult = await createIncident(supabase, {
          organization_id,
          incident_type: detection.recommended_incident_type || 'OTHER',
          severity: detection.severity,
          title: `Signal: ${signal.signal_type}`,
          description: `Detected from ${signal.source}: ${detection.reason}`,
          device_id: signal.device_id,
          latitude: signal.latitude,
          longitude: signal.longitude,
        })

        if ('incident' in incidentResult) {
          incident_id = incidentResult.incident.id

          // Update detection record with incident reference
          await supabase
            .from('signal_detections')
            .update({ incident_id })
            .eq('id', detectionRecord.id)
        } else {
          // Incident creation failed — log but don't block signal processing
          console.error('Failed to create incident candidate:', incidentResult.error)
        }
      }
    }

    return {
      success: true,
      data: {
        signal: signalEvent,
        detection: { ...detectionRecord, incident_id: incident_id || null },
        incident_id,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error processing signal',
    }
  }
}

/**
 * Retrieve signal events with optional filtering.
 */
export async function getSignals(
  supabase: SupabaseClient,
  organization_id: string,
  options?: {
    limit?: number
    offset?: number
    signal_type?: string
    device_id?: string
  }
): Promise<{ signals: SignalEvent[]; total: number; error?: string }> {
  try {
    let query = supabase
      .from('signal_events')
      .select('*', { count: 'exact' })
      .eq('organization_id', organization_id)
      .order('created_at', { ascending: false })

    if (options?.signal_type) {
      query = query.eq('signal_type', options.signal_type)
    }

    if (options?.device_id) {
      query = query.eq('device_id', options.device_id)
    }

    const limit = options?.limit || 50
    const offset = options?.offset || 0

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      return { signals: [], total: 0, error: error.message }
    }

    return { signals: (data || []) as SignalEvent[], total: count || 0 }
  } catch (err) {
    return {
      signals: [],
      total: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Get a specific signal event by ID.
 */
export async function getSignalById(
  supabase: SupabaseClient,
  signal_id: string,
  organization_id: string
): Promise<{ signal?: SignalEvent; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('signal_events')
      .select()
      .eq('id', signal_id)
      .eq('organization_id', organization_id)
      .single()

    if (error) {
      return { error: error.message }
    }

    return { signal: data as SignalEvent }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Get detection results for a signal event.
 */
export async function getSignalDetection(
  supabase: SupabaseClient,
  signal_id: string,
  organization_id: string
): Promise<{ detection?: SignalDetection; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('signal_detections')
      .select()
      .eq('signal_event_id', signal_id)
      .eq('organization_id', organization_id)
      .single()

    if (error) {
      return { error: error.message }
    }

    return { detection: data as SignalDetection }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
