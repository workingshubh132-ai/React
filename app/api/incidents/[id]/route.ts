import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Incident } from '@/types/database'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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

    const { data: incident, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single()

    if (error || !incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    // Get events for this incident
    const { data: events, error: eventsError } = await supabase
      .from('incident_events')
      .select('*')
      .eq('incident_id', id)
      .order('created_at', { ascending: true })

    // Get responder assignments with profile information
    const { data: assignments, error: assignmentsError } = await supabase
      .from('incident_responders')
      .select(
        `
        id,
        responder_id,
        status,
        assigned_at,
        accepted_at,
        arrived_at,
        responders!inner(
          id,
          profile_id,
          profiles!inner(
            full_name
          )
        )
      `
      )
      .eq('incident_id', id)

    // Calculate elapsed time and response metrics
    const now = new Date()
    const detectedAt = new Date(incident.detected_at)
    const elapsedMs = now.getTime() - detectedAt.getTime()
    const elapsedSeconds = Math.floor(elapsedMs / 1000)

    let detectionToVerificationMs: number | null = null
    let verificationToDispatchMs: number | null = null
    let dispatchToRespondingMs: number | null = null

    if (incident.verified_at) {
      detectionToVerificationMs = new Date(incident.verified_at).getTime() - detectedAt.getTime()
    }
    if (incident.dispatched_at && incident.verified_at) {
      verificationToDispatchMs =
        new Date(incident.dispatched_at).getTime() - new Date(incident.verified_at).getTime()
    }

    return NextResponse.json({
      incident: incident as Incident,
      events: events || [],
      assignments: assignments || [],
      metrics: {
        elapsed_seconds: elapsedSeconds,
        detection_to_verification_ms: detectionToVerificationMs,
        verification_to_dispatch_ms: verificationToDispatchMs,
      },
    })
  } catch (error) {
    console.error('GET /api/incidents/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
