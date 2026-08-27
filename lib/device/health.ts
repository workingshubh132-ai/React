import { SupabaseClient } from '@supabase/supabase-js'

export interface DeviceHeartbeatData {
  firmware_version?: string
  battery_level?: number
  battery_voltage_mv?: number
  charging?: boolean
  wifi_rssi?: number
  wifi_ssid?: string
  device_temperature_c?: number
  uptime_seconds?: number
  error_message?: string
}

export interface DeviceStatus {
  status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN'
  last_seen_seconds_ago?: number
  firmware_version?: string
  battery_level?: number
}

const HEARTBEAT_OFFLINE_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes

/**
 * Record a successful device heartbeat.
 */
export async function recordHeartbeat(
  supabase: SupabaseClient,
  device_id: string,
  organization_id: string,
  data: DeviceHeartbeatData,
  latency_ms: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Insert heartbeat record
    const { error: heartbeatError } = await supabase
      .from('device_heartbeats')
      .insert({
        device_id,
        organization_id,
        status: 'SUCCESS',
        latency_ms,
        firmware_version: data.firmware_version,
        battery_level: data.battery_level,
        signal_strength_rssi: data.wifi_rssi,
      })

    if (heartbeatError) {
      console.error('Failed to record heartbeat:', heartbeatError)
      // Non-blocking — don't fail the heartbeat if history fails
    }

    // 2. Update device_health
    const now = new Date().toISOString()

    const updateData: Record<string, any> = {
      status: 'ONLINE',
      last_heartbeat_at: now,
      last_heartbeat_latency_ms: latency_ms,
      updated_at: now,
      error_count_24h: 0, // Reset error count on successful heartbeat
    }

    // Add optional fields if provided
    if (data.firmware_version) updateData.firmware_version = data.firmware_version
    if (data.battery_level !== undefined) updateData.battery_level = data.battery_level
    if (data.battery_voltage_mv !== undefined) updateData.battery_voltage_mv = data.battery_voltage_mv
    if (data.charging !== undefined) updateData.charging = data.charging
    if (data.wifi_rssi !== undefined) updateData.wifi_rssi = data.wifi_rssi
    if (data.wifi_ssid) updateData.wifi_ssid = data.wifi_ssid
    if (data.device_temperature_c !== undefined) updateData.device_temperature_c = data.device_temperature_c
    if (data.uptime_seconds !== undefined) updateData.uptime_seconds = data.uptime_seconds

    const { error: healthError } = await supabase
      .from('device_health')
      .update(updateData)
      .eq('device_id', device_id)

    if (healthError) {
      // If health table doesn't have a row, create one
      if (healthError.code === 'PGRST116') {
        const { error: insertError } = await supabase
          .from('device_health')
          .insert({
            device_id,
            organization_id,
            status: 'ONLINE',
            last_heartbeat_at: now,
            last_heartbeat_latency_ms: latency_ms,
            ...updateData,
          })

        if (insertError) {
          console.error('Failed to create device health:', insertError)
        }
      } else {
        console.error('Failed to update device health:', healthError)
      }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Record a heartbeat error.
 */
export async function recordHeartbeatError(
  supabase: SupabaseClient,
  device_id: string,
  organization_id: string,
  error_message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString()

    // 1. Record error in heartbeat history
    const { error: heartbeatError } = await supabase
      .from('device_heartbeats')
      .insert({
        device_id,
        organization_id,
        status: 'ERROR',
        error_message,
      })

    if (heartbeatError) {
      console.error('Failed to record heartbeat error:', heartbeatError)
    }

    // 2. Update device health status to ERROR
    const { data: currentHealth, error: fetchError } = await supabase
      .from('device_health')
      .select('error_count_24h')
      .eq('device_id', device_id)
      .single()

    const errorCount = (currentHealth?.error_count_24h || 0) + 1

    const { error: updateError } = await supabase
      .from('device_health')
      .update({
        status: 'ERROR',
        last_error_message: error_message,
        last_error_at: now,
        error_count_24h: errorCount,
        updated_at: now,
      })
      .eq('device_id', device_id)

    if (updateError && updateError.code !== 'PGRST116') {
      console.error('Failed to update device health error status:', updateError)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Get current device status.
 */
export async function getDeviceStatus(
  supabase: SupabaseClient,
  device_id: string,
  organization_id: string
): Promise<{ status: DeviceStatus; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('device_health')
      .select('status, last_heartbeat_at, firmware_version, battery_level')
      .eq('device_id', device_id)
      .eq('organization_id', organization_id)
      .single()

    if (error) {
      return { status: { status: 'UNKNOWN' }, error: error.message }
    }

    if (!data) {
      return { status: { status: 'UNKNOWN' } }
    }

    let statusOverride = data.status

    // Check if device should be marked offline
    if (data.last_heartbeat_at) {
      const timeSinceHeartbeat = Date.now() - new Date(data.last_heartbeat_at).getTime()
      if (timeSinceHeartbeat > HEARTBEAT_OFFLINE_TIMEOUT_MS && data.status === 'ONLINE') {
        statusOverride = 'OFFLINE'
      }
    }

    return {
      status: {
        status: statusOverride as 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN',
        last_seen_seconds_ago: data.last_heartbeat_at
          ? Math.floor((Date.now() - new Date(data.last_heartbeat_at).getTime()) / 1000)
          : undefined,
        firmware_version: data.firmware_version,
        battery_level: data.battery_level,
      },
    }
  } catch (err) {
    return { status: { status: 'UNKNOWN' }, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Get all devices in an organization with their status.
 */
export async function getOrganizationDeviceStatuses(
  supabase: SupabaseClient,
  organization_id: string
): Promise<{ devices: Array<{ id: string; status: DeviceStatus }>; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('device_health')
      .select('device_id, status, last_heartbeat_at, firmware_version, battery_level')
      .eq('organization_id', organization_id)

    if (error) {
      return { devices: [], error: error.message }
    }

    const devices = (data || []).map((row) => {
      let statusOverride = row.status

      if (row.last_heartbeat_at) {
        const timeSinceHeartbeat = Date.now() - new Date(row.last_heartbeat_at).getTime()
        if (timeSinceHeartbeat > HEARTBEAT_OFFLINE_TIMEOUT_MS && row.status === 'ONLINE') {
          statusOverride = 'OFFLINE'
        }
      }

      return {
        id: row.device_id,
        status: {
          status: statusOverride as 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN',
          last_seen_seconds_ago: row.last_heartbeat_at
            ? Math.floor((Date.now() - new Date(row.last_heartbeat_at).getTime()) / 1000)
            : undefined,
          firmware_version: row.firmware_version,
          battery_level: row.battery_level,
        },
      }
    })

    return { devices }
  } catch (err) {
    return { devices: [], error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
