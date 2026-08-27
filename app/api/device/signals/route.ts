import { createClient } from '@/lib/supabase/server'
import { authenticateDevice } from '@/lib/device/authentication'
import { processSignal } from '@/lib/signals'
import { recordHeartbeatError } from '@/lib/device/health'

/**
 * POST /api/device/signals
 *
 * Receive a signal from a physical RE:ACT Node device.
 *
 * Authentication:
 * - Device credential in Authorization header (Bearer <credential>)
 * - Organization derived from device record (not from request)
 * - Device must be enabled
 *
 * Idempotency:
 * - Client provides unique event_id
 * - Same event_id will not create duplicate signals
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  try {
    // 1. EXTRACT device credential from Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing device credential' }, { status: 401 })
    }

    const deviceCredential = authHeader.slice(7) // Remove "Bearer "

    // 2. AUTHENTICATE device
    const authResult = await authenticateDevice(supabase, deviceCredential)
    if (!authResult.authenticated || !authResult.device_id || !authResult.organization_id) {
      return Response.json({ error: authResult.error || 'Authentication failed' }, { status: 401 })
    }

    const device_id = authResult.device_id
    const organization_id = authResult.organization_id

    // 3. PARSE request body
    const body = await request.json()

    // Validate required fields
    if (!body.event_id || !body.source || !body.signal_type || !body.severity || !body.occurred_at) {
      return Response.json(
        { error: 'Missing required fields: event_id, source, signal_type, severity, occurred_at' },
        { status: 400 }
      )
    }

    // 4. CHECK for duplicate event (idempotency)
    const { data: existing, error: checkError } = await supabase
      .from('device_signal_idempotency')
      .select('signal_event_id')
      .eq('device_id', device_id)
      .eq('event_id', body.event_id)
      .single()

    if (existing) {
      // Event already processed — return successful response
      return Response.json(
        {
          signal_id: existing.signal_event_id,
          message: 'Event already processed (idempotent)',
        },
        { status: 200 }
      )
    }

    // 5. PROCESS signal (use existing M3 detection engine)
    const result = await processSignal(
      supabase,
      {
        organization_id,
        source: body.source,
        signal_type: body.signal_type,
        severity: body.severity,
        device_id,
        confidence: body.confidence,
        latitude: body.latitude,
        longitude: body.longitude,
        occurred_at: body.occurred_at,
        metadata: body.metadata,
      },
      organization_id
    )

    if (!result.success || !result.data) {
      // Record error
      await recordHeartbeatError(supabase, device_id, organization_id, result.error || 'Unknown error')
      return Response.json({ error: result.error }, { status: 400 })
    }

    // 6. RECORD idempotency key
    const { error: idempError } = await supabase.from('device_signal_idempotency').insert({
      organization_id,
      device_id,
      event_id: body.event_id,
      signal_event_id: result.data.signal.id,
    })

    if (idempError) {
      console.warn('Failed to record idempotency key:', idempError)
      // Non-blocking — signal was processed successfully
    }

    return Response.json(
      {
        signal_id: result.data.signal.id,
        detection_action: result.data.detection.action,
        incident_id: result.data.incident_id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/device/signals error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
