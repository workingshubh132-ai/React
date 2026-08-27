import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/responders/status
 *
 * Update responder availability status.
 * Responders can update their own status.
 * Supervisors can update any responder's status in their organization.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { responder_id, availability } = await request.json()

    // Validate availability status
    const validStatuses = ['AVAILABLE', 'RESPONDING', 'UNAVAILABLE', 'OFF_DUTY']
    if (!validStatuses.includes(availability)) {
      return Response.json(
        { error: `Invalid availability: must be one of ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Get the responder to verify organization
    const { data: responder, error: responderError } = await supabase
      .from('responders')
      .select('id, organization_id, profile_id')
      .eq('id', responder_id)
      .single()

    if (responderError || !responder) {
      return Response.json({ error: 'Responder not found' }, { status: 404 })
    }

    // Authorization: responder can update own status, or supervisor can update any
    const isOwnStatus = responder.profile_id === user.id
    const isSupervisor = profile.role === 'ADMIN' || profile.role === 'SUPERVISOR'

    if (!isOwnStatus && !isSupervisor) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check organization isolation
    if (responder.organization_id !== profile.organization_id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Update responder availability
    const { data: updated, error: updateError } = await supabase
      .from('responders')
      .update({
        availability,
        last_status_update: new Date().toISOString(),
      })
      .eq('id', responder_id)
      .select()
      .single()

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    return Response.json({
      success: true,
      responder: updated,
    })
  } catch (error) {
    console.error('POST /api/responders/status error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
