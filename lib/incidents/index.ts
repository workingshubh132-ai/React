import { SupabaseClient } from '@supabase/supabase-js'
import type { Incident, IncidentStatus, IncidentEvent, IncidentResponder } from '@/types/database'

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  DETECTED: ['VERIFYING', 'FALSE_ALARM'],
  VERIFYING: ['VERIFIED', 'FALSE_ALARM'],
  VERIFIED: ['DISPATCHED'],
  DISPATCHED: ['RESPONDING', 'FALSE_ALARM'],
  RESPONDING: ['RESOLVED', 'FALSE_ALARM'],
  RESOLVED: [],
  FALSE_ALARM: [],
}

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

interface AssignRespondersParams {
  incident_id: string
  responder_ids: string[]
  organization_id: string
  actor_id: string
}

interface UpdateResponderStatusParams {
  incident_responder_id: string
  status: 'ACCEPTED' | 'DECLINED' | 'ARRIVED' | 'COMPLETED'
  actor_id: string
}

function isValidTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export async function createIncident(
  supabase: SupabaseClient,
  params: CreateIncidentParams
): Promise<{ incident: Incident; event: IncidentEvent } | { error: string }> {
  try {
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

    // Record creation event
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
    // Fetch current incident
    const { data: incident, error: fetchError } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .eq('organization_id', organization_id)
      .single()

    if (fetchError || !incident) return { error: 'Incident not found' }

    const currentStatus = incident.status as IncidentStatus

    if (start_verification) {
      if (!isValidTransition(currentStatus, 'VERIFYING')) {
        return { error: `Cannot start verification from ${currentStatus}` }
      }

      const { data, error } = await supabase
        .from('incidents')
        .update({ status: 'VERIFYING', updated_at: new Date().toISOString() })
        .eq('id', incident_id)
        .select()
        .single()

      if (error) return { error: error.message }

      const { data: eventData, error: eventError } = await supabase
        .from('incident_events')
        .insert({
          incident_id,
          organization_id,
          event_type: 'INCIDENT_VERIFICATION_STARTED',
          actor_id,
          metadata: {},
        })
        .select()
        .single()

      if (eventError) return { error: eventError.message }

      return { incident: data as Incident, event: eventData as IncidentEvent }
    } else {
      if (!isValidTransition(currentStatus, 'VERIFIED')) {
        return { error: `Cannot mark verified from ${currentStatus}` }
      }

      const { data, error } = await supabase
        .from('incidents')
        .update({
          status: 'VERIFIED',
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', incident_id)
        .select()
        .single()

      if (error) return { error: error.message }

      const { data: eventData, error: eventError } = await supabase
        .from('incident_events')
        .insert({
          incident_id,
          organization_id,
          event_type: 'INCIDENT_VERIFIED',
          actor_id,
          metadata: {},
        })
        .select()
        .single()

      if (eventError) return { error: eventError.message }

      return { incident: data as Incident, event: eventData as IncidentEvent }
    }
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
    const { data: incident, error: fetchError } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .eq('organization_id', organization_id)
      .single()

    if (fetchError || !incident) return { error: 'Incident not found' }

    const currentStatus = incident.status as IncidentStatus
    if (!isValidTransition(currentStatus, 'FALSE_ALARM')) {
      return { error: `Cannot mark false alarm from ${currentStatus}` }
    }

    const { data, error } = await supabase
      .from('incidents')
      .update({
        status: 'FALSE_ALARM',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident_id)
      .select()
      .single()

    if (error) return { error: error.message }

    const { data: eventData, error: eventError } = await supabase
      .from('incident_events')
      .insert({
        incident_id,
        organization_id,
        event_type: 'INCIDENT_MARKED_FALSE_ALARM',
        actor_id,
        metadata: {},
      })
      .select()
      .single()

    if (eventError) return { error: eventError.message }

    return { incident: data as Incident, event: eventData as IncidentEvent }
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
    const { data: incident, error: fetchError } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .eq('organization_id', organization_id)
      .single()

    if (fetchError || !incident) return { error: 'Incident not found' }

    const currentStatus = incident.status as IncidentStatus
    if (!isValidTransition(currentStatus, 'DISPATCHED')) {
      return { error: `Cannot dispatch from ${currentStatus}` }
    }

    const { data, error } = await supabase
      .from('incidents')
      .update({
        status: 'DISPATCHED',
        dispatched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident_id)
      .select()
      .single()

    if (error) return { error: error.message }

    const { data: eventData, error: eventError } = await supabase
      .from('incident_events')
      .insert({
        incident_id,
        organization_id,
        event_type: 'INCIDENT_DISPATCHED',
        actor_id,
        metadata: { responder_count: responder_ids.length },
      })
      .select()
      .single()

    if (eventError) return { error: eventError.message }

    // Assign responders
    const { data: assignments, error: assignError } = await supabase
      .from('incident_responders')
      .insert(
        responder_ids.map((responder_id) => ({
          incident_id,
          responder_id,
          organization_id,
          status: 'ASSIGNED',
        }))
      )
      .select()

    if (assignError) return { error: assignError.message }

    return { incident: data as Incident, event: eventData as IncidentEvent, assignments: assignments as IncidentResponder[] }
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
    const { data: incident, error: fetchError } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .eq('organization_id', organization_id)
      .single()

    if (fetchError || !incident) return { error: 'Incident not found' }

    const currentStatus = incident.status as IncidentStatus
    if (!isValidTransition(currentStatus, 'RESPONDING')) {
      return { error: `Cannot respond from ${currentStatus}` }
    }

    const { data, error } = await supabase
      .from('incidents')
      .update({
        status: 'RESPONDING',
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident_id)
      .select()
      .single()

    if (error) return { error: error.message }

    const { data: eventData, error: eventError } = await supabase
      .from('incident_events')
      .insert({
        incident_id,
        organization_id,
        event_type: 'RESPONDER_ARRIVED',
        actor_id,
        metadata: {},
      })
      .select()
      .single()

    if (eventError) return { error: eventError.message }

    return { incident: data as Incident, event: eventData as IncidentEvent }
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
    const { data: incident, error: fetchError } = await supabase
      .from('incidents')
      .select()
      .eq('id', incident_id)
      .eq('organization_id', organization_id)
      .single()

    if (fetchError || !incident) return { error: 'Incident not found' }

    const currentStatus = incident.status as IncidentStatus
    if (!isValidTransition(currentStatus, 'RESOLVED')) {
      return { error: `Cannot resolve from ${currentStatus}` }
    }

    const { data, error } = await supabase
      .from('incidents')
      .update({
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident_id)
      .select()
      .single()

    if (error) return { error: error.message }

    const { data: eventData, error: eventError } = await supabase
      .from('incident_events')
      .insert({
        incident_id,
        organization_id,
        event_type: 'INCIDENT_RESOLVED',
        actor_id,
        metadata: {},
      })
      .select()
      .single()

    if (eventError) return { error: eventError.message }

    return { incident: data as Incident, event: eventData as IncidentEvent }
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
    const { data: assignment, error: fetchError } = await supabase
      .from('incident_responders')
      .select()
      .eq('id', incident_responder_id)
      .single()

    if (fetchError || !assignment) return { error: 'Assignment not found' }

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'ACCEPTED') updateData.accepted_at = new Date().toISOString()
    if (status === 'ARRIVED') updateData.arrived_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('incident_responders')
      .update(updateData)
      .eq('id', incident_responder_id)
      .select()
      .single()

    if (error) return { error: error.message }

    const eventType = status === 'ACCEPTED' ? 'RESPONDER_ACCEPTED' : status === 'ARRIVED' ? 'RESPONDER_ARRIVED' : 'INCIDENT_RESOLVED'

    const { data: eventData, error: eventError } = await supabase
      .from('incident_events')
      .insert({
        incident_id: assignment.incident_id,
        organization_id: assignment.organization_id,
        event_type: eventType as any,
        actor_id,
        metadata: { responder_id: assignment.responder_id },
      })
      .select()
      .single()

    if (eventError) return { error: eventError.message }

    return { assignment: data as IncidentResponder, event: eventData as IncidentEvent }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
