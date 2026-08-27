import { createClient } from '@/lib/supabase/server'
import { processSignal, getSignals } from '@/lib/signals'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // 1. Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Get user's organization from profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return Response.json({ error: 'User profile not found' }, { status: 403 })
    }

    const userOrg = { id: profile.organization_id }

    // 3. Parse and process signal
    const body = await request.json()

    const result = await processSignal(
      supabase,
      {
        organization_id: userOrg.id,
        source: body.source,
        signal_type: body.signal_type,
        severity: body.severity,
        device_id: body.device_id,
        confidence: body.confidence,
        latitude: body.latitude,
        longitude: body.longitude,
        occurred_at: body.occurred_at || new Date().toISOString(),
        metadata: body.metadata,
      },
      userOrg.id
    )

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 })
    }

    return Response.json(
      {
        signal: result.data?.signal,
        detection: result.data?.detection,
        incident_id: result.data?.incident_id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/signals error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
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

    // Parse query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const signal_type = searchParams.get('signal_type') || undefined
    const device_id = searchParams.get('device_id') || undefined

    // Fetch signals
    const result = await getSignals(supabase, userOrg.id, {
      limit: Math.min(limit, 100),
      offset,
      signal_type: signal_type || undefined,
      device_id: device_id || undefined,
    })

    if (result.error) {
      return Response.json({ error: result.error }, { status: 500 })
    }

    return Response.json({
      signals: result.signals,
      pagination: {
        limit,
        offset,
        total: result.total,
      },
    })
  } catch (error) {
    console.error('GET /api/signals error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
