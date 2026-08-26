import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateResponderStatus } from '@/lib/incidents'

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

    const { assignment_id, status } = await request.json()

    if (!assignment_id || !status) {
      return NextResponse.json({ error: 'Missing required fields: assignment_id, status' }, { status: 400 })
    }

    if (!['ACCEPTED', 'DECLINED', 'ARRIVED', 'COMPLETED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Get responder associated with this user
    const { data: responder, error: responderError } = await supabase
      .from('responders')
      .select('id')
      .eq('profile_id', user.id)
      .single()

    if (responderError || !responder) {
      return NextResponse.json({ error: 'Responder record not found' }, { status: 404 })
    }

    // Verify this responder is assigned to this incident
    const { data: assignment, error: assignmentError } = await supabase
      .from('incident_responders')
      .select('responder_id')
      .eq('id', assignment_id)
      .eq('incident_id', id)
      .single()

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    if (assignment.responder_id !== responder.id) {
      return NextResponse.json({ error: 'Cannot update another responder status' }, { status: 403 })
    }

    const result = await updateResponderStatus(supabase, assignment_id, status, user.id)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ assignment: result.assignment, event: result.event })
  } catch (error) {
    console.error('POST /api/incidents/[id]/responder-status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
