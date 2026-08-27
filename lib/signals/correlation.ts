import { SupabaseClient } from '@supabase/supabase-js'
import type { SignalType, IncidentStatus } from '@/types/database'

export interface CorrelationDecision {
  should_correlate: boolean
  incident_id?: string
  reason: string
}

/**
 * Correlation Rules for Critical and Important Signals
 *
 * Strategy:
 * 1. Critical signals (SOS, PANIC_BUTTON) can correlate to active incidents
 * 2. Do NOT correlate to RESOLVED or FALSE_ALARM incidents
 * 3. Correlation prevents duplicate incidents from repeated button presses
 * 4. After correlation window expires, new signals create new incidents
 *
 * This prevents:
 *   SOS → SOS → SOS → [3 incidents]
 *
 * And enables:
 *   SOS → [Incident] ← SOS ← SOS [1 incident, 3 signals]
 */

const CRITICAL_SIGNALS: SignalType[] = ['SOS', 'PANIC_BUTTON']
const CORRELATABLE_SIGNALS: SignalType[] = ['SOS', 'PANIC_BUTTON', 'IMPACT', 'SMOKE', 'GAS', 'MANUAL_REPORT']

/**
 * Get the correlation window (in milliseconds) from configuration.
 * Default: 30 seconds = 30000 ms
 */
export async function getCorrelationWindowMs(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('correlation_config')
      .select('value_ms')
      .eq('key', 'signal_correlation_window_ms')
      .single()

    if (error || !data) {
      console.warn('Failed to fetch correlation window config, using default 30000ms')
      return 30000
    }

    return data.value_ms
  } catch (err) {
    console.warn('Error reading correlation config:', err)
    return 30000
  }
}

/**
 * Find the most recent active incident for an organization that could receive correlation.
 *
 * Returns the incident_id if found, or undefined if no suitable incident exists.
 *
 * Criteria:
 * - Must be in organization
 * - Must NOT be RESOLVED or FALSE_ALARM
 * - Must be recent (within correlation window)
 */
export async function findActiveIncidentForCorrelation(
  supabase: SupabaseClient,
  organization_id: string,
  correlation_window_ms: number
): Promise<{ incident_id?: string; incident_status?: IncidentStatus; error?: string }> {
  try {
    const cutoff = new Date(Date.now() - correlation_window_ms).toISOString()

    const { data, error } = await supabase
      .from('incidents')
      .select('id, status')
      .eq('organization_id', organization_id)
      .neq('status', 'RESOLVED')
      .neq('status', 'FALSE_ALARM')
      .gt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // PGRST116 = no rows found (not an error in this context)
      if (error.code === 'PGRST116') {
        return { incident_id: undefined, error: undefined }
      }
      return { error: error.message }
    }

    if (!data) {
      return { incident_id: undefined }
    }

    return { incident_id: data.id, incident_status: data.status }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Determine if a signal should be correlated to an incident using deterministic rules.
 *
 * This function is deterministic and can be tested without database access.
 */
export function canCorrelateSignal(
  signal_type: SignalType,
  incident_status: IncidentStatus
): { can_correlate: boolean; reason: string } {
  // Only certain signal types can correlate
  if (!CORRELATABLE_SIGNALS.includes(signal_type)) {
    return {
      can_correlate: false,
      reason: `${signal_type} signals do not correlate to incidents`,
    }
  }

  // Critical signals cannot correlate to terminal states
  if (CRITICAL_SIGNALS.includes(signal_type)) {
    if (incident_status === 'RESOLVED') {
      return {
        can_correlate: false,
        reason: `${signal_type} cannot correlate to RESOLVED incident`,
      }
    }
    if (incident_status === 'FALSE_ALARM') {
      return {
        can_correlate: false,
        reason: `${signal_type} cannot correlate to FALSE_ALARM incident`,
      }
    }
    return {
      can_correlate: true,
      reason: `${signal_type} correlates to active ${incident_status} incident`,
    }
  }

  // Non-critical signals
  if (incident_status === 'RESOLVED') {
    return {
      can_correlate: false,
      reason: `${signal_type} cannot correlate to RESOLVED incident`,
    }
  }
  if (incident_status === 'FALSE_ALARM') {
    return {
      can_correlate: false,
      reason: `${signal_type} cannot correlate to FALSE_ALARM incident`,
    }
  }

  return {
    can_correlate: true,
    reason: `${signal_type} correlates to active ${incident_status} incident`,
  }
}

/**
 * Create a correlation record linking a signal to an incident.
 *
 * Use this after determining that a signal should be correlated.
 */
export async function correlateSignalToIncident(
  supabase: SupabaseClient,
  organization_id: string,
  signal_event_id: string,
  incident_id: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('signal_incident_correlations').insert({
      organization_id,
      signal_event_id,
      incident_id,
      correlation_reason: reason,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Get correlation information for a signal.
 */
export async function getSignalCorrelation(
  supabase: SupabaseClient,
  signal_event_id: string,
  organization_id: string
): Promise<{ incident_id?: string; correlation_reason?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('signal_incident_correlations')
      .select('incident_id, correlation_reason')
      .eq('signal_event_id', signal_event_id)
      .eq('organization_id', organization_id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return {}
      }
      return { error: error.message }
    }

    return { incident_id: data?.incident_id, correlation_reason: data?.correlation_reason }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
