import { createClient } from '@/lib/supabase/server'
import { disableDevice, enableDevice } from '@/lib/device/authentication'
import { getOrganizationDeviceStatuses } from '@/lib/device/health'

/**
 * GET /api/device/manage
 *
 * List all devices for authenticated user's organization.
 */
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

    // Get user's organization
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return Response.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Only ADMIN can manage devices
    if (profile.role !== 'ADMIN') {
      return Response.json({ error: 'Only administrators can manage devices' }, { status: 403 })
    }

    // Get devices
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('id, device_code, name, enabled, created_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    if (devicesError) {
      return Response.json({ error: devicesError.message }, { status: 500 })
    }

    // Get device statuses
    const statusResult = await getOrganizationDeviceStatuses(supabase, profile.organization_id)

    // Merge device info with status
    const devicesWithStatus = (devices || []).map((device) => {
      const status = statusResult.devices.find((d) => d.id === device.id)?.status || {
        status: 'UNKNOWN',
      }
      return {
        id: device.id,
        device_code: device.device_code,
        name: device.name,
        enabled: device.enabled,
        status: status.status,
        last_seen_seconds_ago: status.last_seen_seconds_ago,
        battery_level: status.battery_level,
        firmware_version: status.firmware_version,
      }
    })

    return Response.json({ devices: devicesWithStatus })
  } catch (error) {
    console.error('GET /api/device/manage error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/device/manage/enable
 *
 * Enable a device.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return Response.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Only ADMIN can manage devices
    if (profile.role !== 'ADMIN') {
      return Response.json({ error: 'Only administrators can manage devices' }, { status: 403 })
    }

    // Parse request
    const body = await request.json()
    const { device_id, action } = body

    if (!device_id || !action) {
      return Response.json({ error: 'Missing device_id or action' }, { status: 400 })
    }

    if (!['enable', 'disable'].includes(action)) {
      return Response.json({ error: 'Invalid action: must be enable or disable' }, { status: 400 })
    }

    // Execute action
    let result
    if (action === 'enable') {
      result = await enableDevice(supabase, profile.organization_id, device_id)
    } else {
      result = await disableDevice(supabase, profile.organization_id, device_id)
    }

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 })
    }

    return Response.json({ success: true, action, device_id })
  } catch (error) {
    console.error('POST /api/device/manage error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
