import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'

/**
 * Real-time subscription manager for emergency coordination
 * Handles incident updates, responder status changes, and connection state
 */

export type ConnectionState = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'

interface RealtimeSubscription {
  channel: RealtimeChannel
  cleanup: () => void
}

const subscriptions = new Map<string, RealtimeSubscription>()

/**
 * Subscribe to active incidents for an organization
 */
export function subscribeToActiveIncidents(
  supabase: SupabaseClient,
  organizationId: string,
  onIncidentsChange: () => void,
  onError?: (error: Error) => void
): () => void {
  const channelName = `org-${organizationId}-incidents`

  // Clean up existing subscription
  if (subscriptions.has(channelName)) {
    subscriptions.get(channelName)?.cleanup()
  }

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'incidents',
        filter: `organization_id=eq.${organizationId}`,
      },
      () => {
        // Trigger refetch of incidents
        onIncidentsChange()
      }
    )
    .on('system', { event: 'join' }, () => {
      // Subscription connected
    })
    .on('system', { event: 'leave' }, () => {
      // Subscription disconnected
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Subscription active
      } else if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Realtime channel error'))
      }
    })

  const cleanup = () => {
    channel.unsubscribe()
  }

  subscriptions.set(channelName, { channel, cleanup })

  return cleanup
}

/**
 * Subscribe to incident responder assignments
 */
export function subscribeToIncidentAssignments(
  supabase: SupabaseClient,
  incidentId: string,
  onAssignmentsChange: () => void,
  onError?: (error: Error) => void
): () => void {
  const channelName = `incident-${incidentId}-assignments`

  if (subscriptions.has(channelName)) {
    subscriptions.get(channelName)?.cleanup()
  }

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'incident_responders',
        filter: `incident_id=eq.${incidentId}`,
      },
      () => {
        onAssignmentsChange()
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Realtime channel error'))
      }
    })

  const cleanup = () => {
    channel.unsubscribe()
  }

  subscriptions.set(channelName, { channel, cleanup })

  return cleanup
}

/**
 * Subscribe to responder status changes
 */
export function subscribeToResponderStatus(
  supabase: SupabaseClient,
  organizationId: string,
  onStatusChange: () => void,
  onError?: (error: Error) => void
): () => void {
  const channelName = `org-${organizationId}-responders`

  if (subscriptions.has(channelName)) {
    subscriptions.get(channelName)?.cleanup()
  }

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'responders',
        filter: `organization_id=eq.${organizationId}`,
      },
      () => {
        onStatusChange()
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Realtime channel error'))
      }
    })

  const cleanup = () => {
    channel.unsubscribe()
  }

  subscriptions.set(channelName, { channel, cleanup })

  return cleanup
}

/**
 * Subscribe to responder's assigned incidents
 */
export function subscribeToResponderAssignments(
  supabase: SupabaseClient,
  responderId: string,
  onAssignmentChange: () => void,
  onError?: (error: Error) => void
): () => void {
  const channelName = `responder-${responderId}-assignments`

  if (subscriptions.has(channelName)) {
    subscriptions.get(channelName)?.cleanup()
  }

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'incident_responders',
        filter: `responder_id=eq.${responderId}`,
      },
      () => {
        onAssignmentChange()
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Realtime channel error'))
      }
    })

  const cleanup = () => {
    channel.unsubscribe()
  }

  subscriptions.set(channelName, { channel, cleanup })

  return cleanup
}

/**
 * Cleanup all subscriptions
 */
export function cleanupAllSubscriptions() {
  subscriptions.forEach((sub) => {
    sub.cleanup()
  })
  subscriptions.clear()
}
