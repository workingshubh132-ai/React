import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/incidents/active
 *
 * List all active incidents for the user's organization.
 * Includes incident status summary and response metrics.
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Fetch active incidents (not RESOLVED or FALSE_ALARM)
    const { data: incidents, error: incidentsError } = await supabase
      .from('incidents')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .not('status', 'in', '(RESOLVED,FALSE_ALARM)')
      .order('detected_at', { ascending: false })

    if (incidentsError) {
      return Response.json({ error: incidentsError.message }, { status: 500 })
    }

    // Fetch incident responders for each incident
    const incidentsWithResponders = await Promise.all(
      (incidents || []).map(async (incident) => {
        const { data: responders } = await supabase
          .from('incident_responders')
          .select('id, responder_id, status, assigned_at, accepted_at')
          .eq('incident_id', incident.id)

        return {
          ...incident,
          responders: responders || [],
        }
      })
    )

    // Fetch summary metrics
    const { data: statusSummary } = await supabase
      .from('vw_incident_status_summary')
      .select('status, count')
      .eq('organization_id', profile.organization_id)

    const { data: severitySummary } = await supabase
      .from('vw_incident_severity_summary')
      .select('severity, count')
      .eq('organization_id', profile.organization_id)

    return Response.json({
      incidents: incidentsWithResponders,
      summary: {
        by_status: statusSummary || [],
        by_severity: severitySummary || [],
        total_active: incidents?.length || 0,
      },
    })
  } catch (error) {
    console.error('GET /api/incidents/active error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
