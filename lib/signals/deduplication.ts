import { SupabaseClient } from '@supabase/supabase-js'
import type { SignalEvent } from '@/types/database'

// 30-second deduplication window
const DEDUP_WINDOW_MS = 30000

export interface DeduplicationDecision {
  is_duplicate: boolean
  reason: string
  group_id?: string
  duplicate_count?: number
}

/**
 * Deduplication Strategy for RE:ACT:
 *
 * Problem: A faulty sensor might send SOS, SOS, SOS in rapid succession.
 *
 * Strategy:
 * 1. For each (organization, device, signal_type) tuple, maintain dedup state
 * 2. Within a 30-second window, identical signals are considered duplicates
 * 3. The first signal in a window creates an incident candidate
 * 4. Subsequent signals increment the duplicate counter but don't create new incidents
 * 5. After the window expires, a fresh signal is treated as new
 *
 * Distinction:
 * - Duplicate: Same device, same signal type, within 30 seconds
 * - Repeated: Multiple genuine signals from same source (after window expires)
 * - Separate: Different device, different signal type, or different incident
 *
 * Critical signals (SOS, PANIC_BUTTON) bypass duplicate checking to ensure
 * no loss during intentional repeated presses.
 */

export async function checkDuplicate(
  supabase: SupabaseClient,
  organization_id: string,
  device_id: string | null,
  signal_type: string,
  occurred_at: Date
): Promise<DeduplicationDecision> {
  if (!device_id) {
    return {
      is_duplicate: false,
      reason: 'No device_id — treating as new signal',
    }
  }

  // Bypass dedup for critical signals — always process
  const CRITICAL_SIGNALS = ['SOS', 'PANIC_BUTTON']
  if (CRITICAL_SIGNALS.includes(signal_type)) {
    return {
      is_duplicate: false,
      reason: `${signal_type} bypasses deduplication — always processed`,
    }
  }

  try {
    const { data: dedupState, error } = await supabase
      .from('signal_deduplication_state')
      .select()
      .eq('organization_id', organization_id)
      .eq('device_id', device_id)
      .eq('signal_type', signal_type)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error)
      return {
        is_duplicate: false,
        reason: `Dedup check failed: ${error.message} — treating as new`,
      }
    }

    // No prior state for this (org, device, signal_type)
    if (!dedupState) {
      return {
        is_duplicate: false,
        reason: 'First occurrence of this signal type from device',
      }
    }

    const lastOccurredAt = new Date(dedupState.last_occurred_at)
    const windowStartAt = new Date(dedupState.window_start)
    const windowEndAt = new Date(windowStartAt.getTime() + DEDUP_WINDOW_MS)
    const nowAt = new Date()

    // Window has expired — treat as new signal
    if (nowAt > windowEndAt) {
      return {
        is_duplicate: false,
        reason: `Dedup window expired (${DEDUP_WINDOW_MS}ms) — treating as new signal`,
      }
    }

    // Within window — duplicate
    return {
      is_duplicate: true,
      reason: `Duplicate within ${DEDUP_WINDOW_MS}ms window (last at ${lastOccurredAt.toISOString()})`,
      group_id: dedupState.last_signal_id,
      duplicate_count: dedupState.duplicate_count + 1,
    }
  } catch (err) {
    // On any unexpected error, treat as new to avoid blocking signals
    return {
      is_duplicate: false,
      reason: `Dedup error: ${err instanceof Error ? err.message : 'Unknown'} — treating as new`,
    }
  }
}

/**
 * Update deduplication state after signal processing.
 * Call this AFTER signal validation but BEFORE incident creation.
 */
export async function updateDeduplicationState(
  supabase: SupabaseClient,
  organization_id: string,
  device_id: string | null,
  signal_type: string,
  signal_id: string,
  occurred_at: Date,
  isDuplicate: boolean
): Promise<void> {
  if (!device_id) {
    return
  }

  try {
    const now = new Date()
    const windowStart = isDuplicate
      ? new Date(Math.floor(now.getTime() / 1000) * 1000) // Keep same window
      : now // New window starts now

    const { error } = await supabase.from('signal_deduplication_state').upsert(
      {
        organization_id,
        device_id,
        signal_type,
        last_signal_id: signal_id,
        last_occurred_at: occurred_at.toISOString(),
        duplicate_count: isDuplicate ? undefined : 1, // Will be incremented on update via trigger or manual logic
        window_start: windowStart.toISOString(),
        updated_at: now.toISOString(),
      },
      {
        onConflict: 'organization_id,device_id,signal_type',
      }
    )

    if (error) {
      console.error('Failed to update dedup state:', error)
      // Non-blocking — dedup is best-effort flood protection
    }
  } catch (err) {
    console.error('Dedup state update error:', err)
    // Non-blocking error
  }
}
