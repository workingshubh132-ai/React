import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dispatchIncident } from '@/lib/incidents'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (!['ADMIN', 'SUPERVISOR'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only ADMIN/SUPERVISOR can dispatch incidents' }, { status: 403 })
    }

    const { responder_ids } = await request.json()

    if (!Array.isArray(responder_ids) || responder_ids.length === 0) {
      return NextResponse.json({ error: 'responder_ids must be a non-empty array' }, { status: 400 })
    }

    const result = await dispatchIncident(supabase, id, profile.organization_id, responder_ids, user.id)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ incident: result.incident, event: result.event, assignments: result.assignments })
  } catch (error) {
    console.error('POST /api/incidents/[id]/dispatch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
