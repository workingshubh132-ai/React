import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createIncident } from '@/lib/incidents'
import type { Incident, IncidentType, IncidentSeverity } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile with organization
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { incident_type, severity, title, description, device_id, latitude, longitude } = await request.json()

    if (!incident_type || !severity || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: incident_type, severity, title' },
        { status: 400 }
      )
    }

    // Only ADMIN and SUPERVISOR can create incidents
    if (!['ADMIN', 'SUPERVISOR'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only ADMIN/SUPERVISOR can create incidents' }, { status: 403 })
    }

    const result = await createIncident(supabase, {
      organization_id: profile.organization_id,
      incident_type: incident_type as IncidentType,
      severity: severity as IncidentSeverity,
      title,
      description: description || null,
      device_id: device_id || null,
      reported_by: user.id,
      latitude: latitude || null,
      longitude: longitude || null,
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ incident: result.incident, event: result.event }, { status: 201 })
  } catch (error) {
    console.error('POST /api/incidents error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get incidents for user's organization
    const { data: incidents, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('detected_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ incidents: incidents as Incident[] })
  } catch (error) {
    console.error('GET /api/incidents error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
