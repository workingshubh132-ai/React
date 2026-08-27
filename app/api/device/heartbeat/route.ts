import { createClient } from '@/lib/supabase/server'
import { authenticateDevice } from '@/lib/device/authentication'
import { recordHeartbeat, recordHeartbeatError } from '@/lib/device/health'

/**
 * POST /api/device/heartbeat
 *
 * Receive a heartbeat from a physical RE:ACT Node device.
 *
 * Heartbeat indicates device is alive and provides health metrics:
 * - Firmware version
 * - Battery level
 * - Signal strength
 * - Device temperature
 * - Uptime
 *
 * Authentication: Same as /api/device/signals (Bearer token)
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const startTime = Date.now()

  try {
    // 1. EXTRACT and validate credential
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing device credential' }, { status: 401 })
    }

    const deviceCredential = authHeader.slice(7)

    // 2. AUTHENTICATE device
    const authResult = await authenticateDevice(supabase, deviceCredential)
    if (!authResult.authenticated || !authResult.device_id || !authResult.organization_id) {
      return Response.json({ error: authResult.error || 'Authentication failed' }, { status: 401 })
    }

    const device_id = authResult.device_id
    const organization_id = authResult.organization_id

    // 3. PARSE heartbeat data
    const body = await request.json()

    // Optional fields — device can send what it has
    const heartbeatData = {
      firmware_version: body.firmware_version,
      battery_level: body.battery_level,
      battery_voltage_mv: body.battery_voltage_mv,
      charging: body.charging,
      wifi_rssi: body.wifi_rssi,
      wifi_ssid: body.wifi_ssid,
      device_temperature_c: body.device_temperature_c,
      uptime_seconds: body.uptime_seconds,
    }

    // Validate heartbeat data if provided
    if (heartbeatData.battery_level !== undefined) {
      if (typeof heartbeatData.battery_level !== 'number' || heartbeatData.battery_level < 0 || heartbeatData.battery_level > 100) {
        return Response.json({ error: 'Invalid battery_level: must be 0-100' }, { status: 400 })
      }
    }

    if (heartbeatData.wifi_rssi !== undefined) {
      if (typeof heartbeatData.wifi_rssi !== 'number' || heartbeatData.wifi_rssi > 0 || heartbeatData.wifi_rssi < -120) {
        return Response.json({ error: 'Invalid wifi_rssi: must be -120 to 0 dBm' }, { status: 400 })
      }
    }

    // 4. RECORD heartbeat with latency measurement
    const latency_ms = Date.now() - startTime

    const result = await recordHeartbeat(supabase, device_id, organization_id, heartbeatData, latency_ms)

    if (!result.success) {
      return Response.json({ error: result.error || 'Failed to record heartbeat' }, { status: 500 })
    }

    // 5. RETURN acknowledgement
    return Response.json(
      {
        acknowledged: true,
        server_time: new Date().toISOString(),
        latency_ms,
      },
      { status: 200 }
    )
  } catch (error) {
    // Record error for debugging
    if (error instanceof Error && 'device_id' in error) {
      const device_id = (error as any).device_id
      const organization_id = (error as any).organization_id
      if (device_id && organization_id) {
        await recordHeartbeatError(supabase, device_id, organization_id, error.message)
      }
    }

    console.error('POST /api/device/heartbeat error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
