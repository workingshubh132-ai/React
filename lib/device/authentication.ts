import { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export interface DeviceAuthResult {
  authenticated: boolean
  device_id?: string
  organization_id?: string
  firmware_version?: string
  error?: string
}

/**
 * Hash a device credential for storage.
 * NEVER store plain credentials; only hashes.
 */
export function hashCredential(credential: string): string {
  return crypto.createHash('sha256').update(credential).digest('hex')
}

/**
 * Verify a device credential against stored hash.
 */
export function verifyCredential(plain: string, hash: string): boolean {
  const computed = hashCredential(plain)
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))
}

/**
 * Authenticate a physical RE:ACT Node device.
 *
 * Device credentials are individually provisioned (not shared).
 * Organization is derived from device record, not client input.
 * Device must be enabled; disabled devices are rejected.
 */
export async function authenticateDevice(
  supabase: SupabaseClient,
  device_credential: string
): Promise<DeviceAuthResult> {
  try {
    const credentialHash = hashCredential(device_credential)

    // 1. Look up credential
    const { data: credData, error: credError } = await supabase
      .from('device_credentials')
      .select('device_id, organization_id, revoked_at, expires_at')
      .eq('credential_hash', credentialHash)
      .single()

    if (credError || !credData) {
      return { authenticated: false, error: 'Invalid device credential' }
    }

    // 2. Check if credential is revoked
    if (credData.revoked_at) {
      return { authenticated: false, error: 'Device credential has been revoked' }
    }

    // 3. Check if credential has expired
    if (credData.expires_at) {
      const expiresAt = new Date(credData.expires_at)
      if (new Date() > expiresAt) {
        return { authenticated: false, error: 'Device credential has expired' }
      }
    }

    // 4. Verify device exists and get full device record
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, organization_id, enabled')
      .eq('id', credData.device_id)
      .single()

    if (deviceError || !device) {
      return { authenticated: false, error: 'Device not found' }
    }

    // 5. Verify device is enabled
    if (!device.enabled) {
      return { authenticated: false, error: 'Device is disabled' }
    }

    // 6. Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', device.organization_id)
      .single()

    if (orgError || !org) {
      return { authenticated: false, error: 'Organization not found' }
    }

    return {
      authenticated: true,
      device_id: device.id,
      organization_id: device.organization_id,
    }
  } catch (err) {
    return {
      authenticated: false,
      error: err instanceof Error ? err.message : 'Authentication failed',
    }
  }
}

/**
 * Revoke a device credential (e.g., when device is compromised).
 */
export async function revokeDeviceCredential(
  supabase: SupabaseClient,
  organization_id: string,
  device_id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('device_credentials')
      .update({ revoked_at: new Date().toISOString() })
      .eq('device_id', device_id)
      .eq('organization_id', organization_id)
      .is('revoked_at', null) // Only revoke active credentials

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Disable a device (prevents further authentication).
 */
export async function disableDevice(
  supabase: SupabaseClient,
  organization_id: string,
  device_id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify device belongs to organization
    const { data: device, error: checkError } = await supabase
      .from('devices')
      .select('id')
      .eq('id', device_id)
      .eq('organization_id', organization_id)
      .single()

    if (checkError || !device) {
      return { success: false, error: 'Device not found or does not belong to organization' }
    }

    // Disable device
    const { error: updateError } = await supabase
      .from('devices')
      .update({ enabled: false })
      .eq('id', device_id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Enable a device (allows authentication).
 */
export async function enableDevice(
  supabase: SupabaseClient,
  organization_id: string,
  device_id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify device belongs to organization
    const { data: device, error: checkError } = await supabase
      .from('devices')
      .select('id')
      .eq('id', device_id)
      .eq('organization_id', organization_id)
      .single()

    if (checkError || !device) {
      return { success: false, error: 'Device not found or does not belong to organization' }
    }

    // Enable device
    const { error: updateError } = await supabase
      .from('devices')
      .update({ enabled: true })
      .eq('id', device_id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
