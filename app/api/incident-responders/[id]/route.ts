import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ResponderAction = 'accept' | 'respond' | 'arrive' | 'complete'

const ACTION_TO_STATUS: Record<ResponderAction, string> = {
  accept: 'ACCEPTED',
  respond: 'RESPONDING',
  arrive: 'ARRIVED',
  complete: 'COMPLETED',
}

const STATUS_TO_TIMESTAMP: Record<string, string> = {
  ACCEPTED: 'accepted_at',
  RESPONDED: 'responded_at',
  RESPONDING: 'responded_at',
  ARRIVED: 'arrived_at',
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile and verify RESPONDER role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.role !== 'RESPONDER') {
      return NextResponse.json({ error: 'Only RESPONDERS can update assignments' }, { status: 403 })
    }

    // Get responder record for this user
    const { data: responder, error: responderError } = await supabase
      .from('responders')
      .select('id')
      .eq('profile_id', user.id)
      .single()

    if (responderError || !responder) {
      return NextResponse.json({ error: 'Responder record not found' }, { status: 404 })
    }

    // Get the assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from('incident_responders')
      .select()
      .eq('id', id)
      .single()

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    // Verify assignment belongs to this responder and organization
    if (assignment.responder_id !== responder.id || assignment.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    // Parse action from request body
    const { action } = await request.json()

    if (!action || !Object.keys(ACTION_TO_STATUS).includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be one of: accept, respond, arrive, complete' },
        { status: 400 }
      )
    }

    const typedAction = action as ResponderAction
    const newStatus = ACTION_TO_STATUS[typedAction]
    const timestampField = STATUS_TO_TIMESTAMP[newStatus]

    // Validate state transition
    const validTransitions: Record<string, ResponderAction[]> = {
      ASSIGNED: ['accept'],
      ACCEPTED: ['respond'],
      RESPONDING: ['arrive'],
      ARRIVED: ['complete'],
      COMPLETED: [],
      DECLINED: [],
    }

    if (!validTransitions[assignment.status]?.includes(typedAction)) {
      return NextResponse.json(
        { error: `Invalid transition from ${assignment.status} with action ${action}` },
        { status: 400 }
      )
    }

    // Prepare update data
    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    // Set appropriate timestamp based on action
    if (timestampField) {
      updateData[timestampField] = new Date().toISOString()
    }

    // Update assignment
    const { data: updatedAssignment, error: updateError } = await supabase
      .from('incident_responders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError || !updatedAssignment) {
      console.error('Failed to update assignment:', updateError)
      return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 })
    }

    return NextResponse.json({
      assignment: updatedAssignment,
    })
  } catch (error) {
    console.error('PATCH /api/incident-responders/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
