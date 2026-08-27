import { SupabaseClient } from '@supabase/supabase-js'
import type { Incident, IncidentStatus, IncidentEvent, IncidentResponder } from '@/types/database'

interface CreateIncidentParams {
  organization_id: string
  incident_type: Incident['incident_type']
  severity: Incident['severity']
  title: string
  description?: string | null
  device_id?: string | null
  reported_by?: string | null
  latitude?: number | null
  longitude?: number | null
}

interface TransitionResult {
  success: boolean
  incident_id: string
  new_status?: string
  event_id?: string
  error_message?: string
}

export async function createIncident(
  supabase: SupabaseClient,
  params: CreateIncidentParams
): Promise<{ incident: Incident; event: IncidentEvent } | { error: string }> {
  try {
    // Create incident directly (no RPC needed for initial creation with hardcoded DETECTED status)
    const { data, error } = await supabase
      .from('incidents')
      .insert({
        organization_id: params.organization_id,
        incident_type: params.incident_type,
        severity: params.severity,
        title: params.title,
        description: params.description || null,
        device_id: params.device_id || null,
        reported_by: params.reported_by || null,
        latitude: params.latitude || null,
        longitude: params.longitude || null,
        status: 'DETECTED',
        detected_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return { error: error.message }

    const incident = data as Incident

    // Record creation event (atomic with creation via database trigger or explicit insert)
    const { data: eventData, error: eventError } = await supabase
      .from('incident_events')
      .insert({
        incident_id: incident.id,
        organization_id: params.organization_id,
        event_type: 'INCIDENT_CREATED',
        actor_id: params.reported_by || null,
        metadata: {
          type: params.incident_type,
          severity: params.severity,
        },
      })
      .select()
      .single()

    if (eventError) return { error: eventError.message }

    return { incident, event: eventData as IncidentEvent }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function verifyIncident(
  supabase: SupabaseClient,
  incident_id: string,
  organization_id: string,
  actor_id: string,
  start_verification?: boolean
): Promise<{ incident: Incident; event: IncidentEvent } | { error: string }> {
  try {
    const rpcFunction = start_verification
      ? 'transition_incident_to_verifying'
      : 'transition_incident_to_verified'

    const { data, error } = await supabase.rpc(rpcFunction, {
      p_incident_id: incident_id,
      p_organization_id: organization_id,
      p_actor_id: actor_id,
    })

    if (error) return { error: error.message }

    if (!data || !data[0]?.success) {
      return { error: data?.[0]?.error_message || 'Transition failed' }
    }

    // Fetch the updated incident and event
    const { data: incident } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .single()

    const { data: event } = await supabase
      .from('incident_events')
      .select()
      .eq('id', data[0].event_id)
      .single()

    if (!incident || !event) return { error: 'Failed to fetch updated records' }

    return { incident: incident as Incident, event: event as IncidentEvent }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function markFalseAlarm(
  supabase: SupabaseClient,
  incident_id: string,
  organization_id: string,
  actor_id: string
): Promise<{ incident: Incident; event: IncidentEvent } | { error: string }> {
  try {
    const { data, error } = await supabase.rpc('transition_incident_to_false_alarm', {
      p_incident_id: incident_id,
      p_organization_id: organization_id,
      p_actor_id: actor_id,
    })

    if (error) return { error: error.message }

    if (!data || !data[0]?.success) {
      return { error: data?.[0]?.error_message || 'Transition failed' }
    }

    const { data: incident } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .single()

    const { data: event } = await supabase
      .from('incident_events')
      .select()
      .eq('id', data[0].event_id)
      .single()

    if (!incident || !event) return { error: 'Failed to fetch updated records' }

    return { incident: incident as Incident, event: event as IncidentEvent }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function dispatchIncident(
  supabase: SupabaseClient,
  incident_id: string,
  organization_id: string,
  responder_ids: string[],
  actor_id: string
): Promise<{ incident: Incident; event: IncidentEvent; assignments: IncidentResponder[] } | { error: string }> {
  try {
    const { data, error } = await supabase.rpc('transition_incident_to_dispatched', {
      p_incident_id: incident_id,
      p_organization_id: organization_id,
      p_actor_id: actor_id,
      p_responder_ids: responder_ids,
    })

    if (error) return { error: error.message }

    if (!data || !data[0]?.success) {
      return { error: data?.[0]?.error_message || 'Transition failed' }
    }

    const { data: incident } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .single()

    const { data: event } = await supabase
      .from('incident_events')
      .select()
      .eq('id', data[0].event_id)
      .single()

    const { data: assignments } = await supabase
      .from('incident_responders')
      .select()
      .eq('incident_id', incident_id)

    if (!incident || !event) return { error: 'Failed to fetch updated records' }

    return {
      incident: incident as Incident,
      event: event as IncidentEvent,
      assignments: (assignments || []) as IncidentResponder[],
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function respondToIncident(
  supabase: SupabaseClient,
  incident_id: string,
  organization_id: string,
  actor_id: string
): Promise<{ incident: Incident; event: IncidentEvent } | { error: string }> {
  try {
    const { data, error } = await supabase.rpc('transition_incident_to_responding', {
      p_incident_id: incident_id,
      p_organization_id: organization_id,
      p_actor_id: actor_id,
    })

    if (error) return { error: error.message }

    if (!data || !data[0]?.success) {
      return { error: data?.[0]?.error_message || 'Transition failed' }
    }

    const { data: incident } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .single()

    const { data: event } = await supabase
      .from('incident_events')
      .select()
      .eq('id', data[0].event_id)
      .single()

    if (!incident || !event) return { error: 'Failed to fetch updated records' }

    return { incident: incident as Incident, event: event as IncidentEvent }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function resolveIncident(
  supabase: SupabaseClient,
  incident_id: string,
  organization_id: string,
  actor_id: string
): Promise<{ incident: Incident; event: IncidentEvent } | { error: string }> {
  try {
    const { data, error } = await supabase.rpc('transition_incident_to_resolved', {
      p_incident_id: incident_id,
      p_organization_id: organization_id,
      p_actor_id: actor_id,
    })

    if (error) return { error: error.message }

    if (!data || !data[0]?.success) {
      return { error: data?.[0]?.error_message || 'Transition failed' }
    }

    const { data: incident } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .single()

    const { data: event } = await supabase
      .from('incident_events')
      .select()
      .eq('id', data[0].event_id)
      .single()

    if (!incident || !event) return { error: 'Failed to fetch updated records' }

    return { incident: incident as Incident, event: event as IncidentEvent }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateResponderStatus(
  supabase: SupabaseClient,
  incident_responder_id: string,
  status: 'ACCEPTED' | 'DECLINED' | 'ARRIVED' | 'COMPLETED',
  actor_id: string
): Promise<{ assignment: IncidentResponder; event: IncidentEvent } | { error: string }> {
  try {
    const { data, error } = await supabase.rpc('update_responder_assignment_status', {
      p_assignment_id: incident_responder_id,
      p_new_status: status,
      p_actor_id: actor_id,
    })

    if (error) return { error: error.message }

    if (!data || !data[0]?.success) {
      return { error: data?.[0]?.error_message || 'Update failed' }
    }

    const { data: assignment } = await supabase
      .from('incident_responders')
      .select()
      .eq('id', incident_responder_id)
      .single()

    const { data: event } = await supabase
      .from('incident_events')
      .select()
      .eq('id', data[0].event_id)
      .single()

    if (!assignment || !event) return { error: 'Failed to fetch updated records' }

    return { assignment: assignment as IncidentResponder, event: event as IncidentEvent }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
