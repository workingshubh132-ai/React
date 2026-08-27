import { createClient } from '@/lib/supabase/server'
import { getSignalById, getSignalDetection } from '@/lib/signals'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization from profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return Response.json({ error: 'User profile not found' }, { status: 403 })
    }

    const userOrg = { id: profile.organization_id }

    // Fetch signal
    const signalResult = await getSignalById(supabase, id, userOrg.id)

    if (signalResult.error || !signalResult.signal) {
      return Response.json({ error: signalResult.error || 'Signal not found' }, { status: 404 })
    }

    // Fetch detection result
    const detectionResult = await getSignalDetection(supabase, id, userOrg.id)

    return Response.json({
      signal: signalResult.signal,
      detection: detectionResult.detection,
    })
  } catch (error) {
    console.error('GET /api/signals/:id error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
