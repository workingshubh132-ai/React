import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyIncident } from '@/lib/incidents'

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
      return NextResponse.json({ error: 'Only ADMIN/SUPERVISOR can verify incidents' }, { status: 403 })
    }

    const { start_verification } = await request.json()

    const result = await verifyIncident(supabase, id, profile.organization_id, user.id, start_verification === true)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ incident: result.incident, event: result.event })
  } catch (error) {
    console.error('POST /api/incidents/[id]/verify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
