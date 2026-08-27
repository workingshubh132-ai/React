import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/responders/available
 *
 * List all available responders in the user's organization.
 * Filters by AVAILABLE status and active profiles.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Fetch available responders (not disabled, AVAILABLE status)
    const { data: responders, error } = await supabase
      .from('responders')
      .select(
        `
        id,
        profile_id,
        organization_id,
        availability,
        last_status_update,
        specializations,
        latitude,
        longitude,
        profiles!inner(
          id,
          full_name,
          role
        )
      `
      )
      .eq('organization_id', profile.organization_id)
      .eq('availability', 'AVAILABLE')
      .eq('profiles.role', 'RESPONDER')
      .order('last_status_update', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({
      responders: responders || [],
      count: responders?.length || 0,
    })
  } catch (error) {
    console.error('GET /api/responders/available error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
