/**
 * M5 Phase 3 - Integration Test Setup & Helpers
 *
 * This module provides test fixtures and utilities for integration testing
 * the RE:ACT emergency coordination platform against a real Supabase instance.
 *
 * Prerequisites:
 * - Supabase project with migrations applied
 * - Environment variables: SUPABASE_URL, SUPABASE_KEY
 * - Test database access
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Test Environment Configuration
 */
export interface TestEnv {
  supabaseUrl: string
  supabaseKey: string
  apiBaseUrl: string
}

/**
 * Test User Fixtures
 */
export interface TestUser {
  id: string
  email: string
  password: string
  role: 'ADMIN' | 'SUPERVISOR' | 'RESPONDER'
  organizationId: string
}

/**
 * Test Organization Fixtures
 */
export interface TestOrganization {
  id: string
  name: string
  slug: string
  created_at?: string
}

/**
 * Test Responder Fixtures
 */
export interface TestResponder {
  id: string
  responderId: string
  profileId: string
  organizationId: string
  availability: string
  created_at?: string
}

/**
 * Get test environment configuration from .env or environment variables
 */
export function getTestEnv(): TestEnv {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const apiBaseUrl = process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3000'

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Test environment not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'
    )
  }

  return { supabaseUrl, supabaseKey, apiBaseUrl }
}

/**
 * Create Supabase client for testing
 */
export function createTestClient(): SupabaseClient {
  const env = getTestEnv()
  return createClient(env.supabaseUrl, env.supabaseKey)
}

/**
 * Test fixture generator - Organizations
 */
export function generateTestOrganization(prefix: string = 'test'): Omit<TestOrganization, 'created_at'> {
  const id = `org-${prefix}-${Date.now()}`
  return {
    id,
    name: `Test Organization ${prefix}`,
    slug: `test-${prefix}-${Date.now()}`,
  }
}

/**
 * Test fixture generator - Users
 */
export function generateTestUser(
  organizationId: string,
  role: 'ADMIN' | 'SUPERVISOR' | 'RESPONDER' = 'RESPONDER'
): Omit<TestUser, 'id'> {
  const email = `test-${role.toLowerCase()}-${Date.now()}@react.local`
  return {
    email,
    password: 'TestPassword123!',
    role,
    organizationId,
  }
}

/**
 * Authentication & Token Management
 */
export interface TestAuthToken {
  accessToken: string
  refreshToken: string
  userId: string
  expiresAt: number
}

/**
 * Authenticate test user and get token
 * Usage: When Supabase REST API or service client is available
 */
export async function authenticateTestUser(email: string, password: string): Promise<TestAuthToken> {
  const env = getTestEnv()
  const client = createTestClient()

  // Note: This would use Supabase auth API in a real scenario
  // For now, this is a placeholder that documents the expected flow
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    throw new Error(`Authentication failed: ${error?.message || 'No session returned'}`)
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token || '',
    userId: data.user.id,
    expiresAt: data.session.expires_at || Date.now() + 3600 * 1000,
  }
}

/**
 * Make authenticated API request
 */
export async function makeAuthenticatedRequest(
  method: string,
  path: string,
  token: string,
  body?: any
): Promise<Response> {
  const env = getTestEnv()
  const url = new URL(path, env.apiBaseUrl).toString()

  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Database Seeding Helpers
 */
export async function seedTestData(
  client: SupabaseClient
): Promise<{ org1: TestOrganization; org2: TestOrganization; users: TestUser[] }> {
  // Note: This would connect directly to Supabase in a real integration test
  // For now, this documents the expected seeding process

  const org1 = generateTestOrganization('a')
  const org2 = generateTestOrganization('b')

  // In real test: Insert organizations
  // const { data: orgs, error } = await client
  //   .from('organizations')
  //   .insert([org1, org2])
  //   .select()

  // Create test users for each org
  const users: TestUser[] = []

  // In real test: Create users via auth API or direct insert
  // ...

  return {
    org1: org1 as TestOrganization,
    org2: org2 as TestOrganization,
    users,
  }
}

/**
 * Cleanup Helpers
 */
export async function cleanupTestData(client: SupabaseClient, organizationIds: string[]): Promise<void> {
  // Note: In real integration test, delete test data after test completes
  // Cascade delete should handle related records due to FK constraints

  for (const orgId of organizationIds) {
    // Delete organization and cascade
    // const { error } = await client
    //   .from('organizations')
    //   .delete()
    //   .eq('id', orgId)
  }
}

/**
 * Test Assertions
 */
export function assertAuthorized(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Expected authorized request, got ${response.status}`)
  }
}

export function assertUnauthorized(response: Response): void {
  if (response.status !== 401 && response.status !== 403) {
    throw new Error(`Expected unauthorized (401/403), got ${response.status}`)
  }
}

export function assertNotFound(response: Response): void {
  if (response.status !== 404) {
    throw new Error(`Expected not found (404), got ${response.status}`)
  }
}

export function assertSuccess(response: Response): void {
  if (!response.ok) {
    throw new Error(`Expected success response, got ${response.status}`)
  }
}

/**
 * Common Test Data Patterns
 */
export const TEST_DATA = {
  INCIDENT: {
    CRITICAL_FIRE: {
      title: 'Critical Fire Detected',
      incident_type: 'FIRE',
      severity: 'CRITICAL',
      description: 'Multi-story building fire detected',
    },
    HIGH_MEDICAL: {
      title: 'Medical Emergency',
      incident_type: 'MEDICAL',
      severity: 'HIGH',
      description: 'Chest pain reported',
    },
  },
  SIGNAL: {
    VALID_SOS: {
      signal_type: 'MOTION_DETECTED',
      signal_strength: 85,
      motion_detected: true,
    },
    VALID_ENVIRONMENTAL: {
      signal_type: 'ENVIRONMENTAL',
      temperature: 850, // Fahrenheit - high
      smoke_level: 95,
    },
  },
  DEVICE: {
    VALID_CREDENTIALS: {
      device_id: 'react-node-001',
      credential_type: 'hmac_sha256',
      credential_value: 'test-secret-key-12345',
    },
  },
}

/**
 * Test Reporting Utilities
 */
export interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  duration: number
  error?: string
}

export class TestReporter {
  private results: TestResult[] = []

  recordResult(name: string, status: 'PASS' | 'FAIL' | 'SKIP', duration: number, error?: string): void {
    this.results.push({ name, status, duration, error })
  }

  getResults(): TestResult[] {
    return this.results
  }

  getSummary(): {
    total: number
    passed: number
    failed: number
    skipped: number
  } {
    return {
      total: this.results.length,
      passed: this.results.filter((r) => r.status === 'PASS').length,
      failed: this.results.filter((r) => r.status === 'FAIL').length,
      skipped: this.results.filter((r) => r.status === 'SKIP').length,
    }
  }

  printReport(): void {
    console.log('\n=== Integration Test Report ===')
    console.log(`Total: ${this.results.length}`)
    console.log(`Passed: ${this.getSummary().passed}`)
    console.log(`Failed: ${this.getSummary().failed}`)
    console.log(`Skipped: ${this.getSummary().skipped}`)

    if (this.getSummary().failed > 0) {
      console.log('\nFailures:')
      this.results
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`  - ${r.name}: ${r.error}`)
        })
    }
  }
}
