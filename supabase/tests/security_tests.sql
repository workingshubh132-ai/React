-- RE:ACT M1 Security Adversarial Tests
-- These tests verify that critical vulnerabilities have been fixed
-- To be executed against a real Supabase instance

-- ============================================================================
-- TEST SETUP
-- ============================================================================
-- Before running tests, create test data:
-- 1. Create Organization A and B
-- 2. Create test users in each organization
-- 3. Assign roles: RESPONDER to user_a, ADMIN to user_admin_a

-- ============================================================================
-- TEST A: Privilege Escalation - User Cannot Change Own Role
-- ============================================================================
-- Scenario: RESPONDER user attempts to escalate to ADMIN
-- Expected: UPDATE fails (denied by RLS)

-- As user_a (RESPONDER in Org A):
UPDATE profiles
SET role = 'ADMIN'
WHERE id = auth.uid();

-- Expected result: DENIED
-- Reason: WITH CHECK constraint requires role to remain unchanged:
--   role = (SELECT role FROM profiles WHERE id = auth.uid())
-- Since role is currently RESPONDER, only RESPONDER value passes check
-- Attempting to set ADMIN fails the WITH CHECK clause

-- ============================================================================
-- TEST B: Organization Switching - User Cannot Change Own Org
-- ============================================================================
-- Scenario: User in Org A attempts to move to Org B
-- Expected: UPDATE fails (denied by RLS)

-- First, get Org B's ID from organizations table (this is allowed - SELECT works)
SELECT id AS org_b_id FROM organizations WHERE slug = 'org-b' LIMIT 1;

-- As user_a (in Org A):
-- Attempt to move to Org B:
UPDATE profiles
SET organization_id = 'org-b-uuid'
WHERE id = auth.uid();

-- Expected result: DENIED
-- Reason: WITH CHECK constraint requires organization_id to remain unchanged:
--   organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
-- Since organization_id is currently Org A, only that value passes check
-- Attempting to set Org B fails the WITH CHECK clause

-- ============================================================================
-- TEST C: Cross-Organization Read - User Cannot Access Other Org Data
-- ============================================================================
-- Scenario: User A from Org A queries Device from Org B
-- Expected: No results / device not visible

-- As user_a (in Org A):
SELECT * FROM devices WHERE id = 'device-from-org-b-id';

-- Expected result: No rows returned (empty result set)
-- Reason: Device SELECT policy filters:
--   organization_id IN (
--     SELECT organization_id FROM profiles WHERE id = auth.uid()
--   )
-- User A's profile.organization_id = Org A
-- Device belongs to Org B
-- RLS filters out the device, query returns empty

-- ============================================================================
-- TEST D: Cross-Organization Write - User Cannot Modify Other Org Data
-- ============================================================================
-- Scenario: User A from Org A attempts to UPDATE Device from Org B
-- Expected: UPDATE fails (denied by RLS)

-- As user_a (in Org A):
UPDATE devices
SET status = 'error'
WHERE id = 'device-from-org-b-id';

-- Expected result: DENIED / No rows updated
-- Reason: Device UPDATE policy checks:
--   organization_id IN (
--     SELECT organization_id FROM profiles
--     WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
--   )
-- Device belongs to Org B, not Org A
-- RLS blocks the update

-- ============================================================================
-- TEST E: Organization Delete - User Cannot Delete Organization
-- ============================================================================
-- Scenario: Any normal user attempts to delete an organization
-- Expected: DELETE fails (denied by RLS)

-- As user_a (RESPONDER in Org A):
DELETE FROM organizations WHERE id = 'org-a-id';

-- Expected result: DENIED
-- Reason: Organization DELETE policy:
--   USING (false)
-- The condition is always false, so no rows satisfy the policy
-- RLS denies the delete for all users except service role

-- ============================================================================
-- TEST F: Organization Update - User Cannot Modify Organization
-- ============================================================================
-- Scenario: Any normal user attempts to modify an organization
-- Expected: UPDATE fails (denied by RLS)

-- As user_a (in Org A):
UPDATE organizations
SET name = 'Hacked Org'
WHERE id = 'org-a-id';

-- Expected result: DENIED
-- Reason: Organization UPDATE policy:
--   WITH CHECK (false)
-- The condition is always false
-- RLS denies the update for all users except service role

-- ============================================================================
-- TEST G: Organization Insert - User Cannot Create Organization
-- ============================================================================
-- Scenario: Any normal user attempts to create an organization
-- Expected: INSERT fails (denied by RLS)

-- As user_a (any user):
INSERT INTO organizations (name, slug)
VALUES ('New Hacked Org', 'hacked-org');

-- Expected result: DENIED
-- Reason: Organization INSERT policy:
--   WITH CHECK (false)
-- The condition is always false
-- RLS denies the insert for all users except service role

-- ============================================================================
-- TEST H: Legitimate Profile Update - User CAN Update Name
-- ============================================================================
-- Scenario: User updates their own full_name (legitimate operation)
-- Expected: UPDATE succeeds

-- As user_a:
UPDATE profiles
SET full_name = 'New Name'
WHERE id = auth.uid();

-- Expected result: SUCCESS / 1 row updated
-- Reason: WITH CHECK constraint passes:
--   id = auth.uid() ✓ (same user)
--   role = (SELECT role FROM profiles WHERE id = auth.uid()) ✓ (role unchanged)
--   organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()) ✓ (org unchanged)
-- All constraints satisfied, update succeeds

-- ============================================================================
-- TEST I: Valid Device Creation by Admin - ADMIN CAN Create Device
-- ============================================================================
-- Scenario: ADMIN user creates a device in their organization
-- Expected: INSERT succeeds

-- As user_admin_a (ADMIN in Org A):
INSERT INTO devices (organization_id, device_code, name, status)
VALUES (
  (SELECT organization_id FROM profiles WHERE id = auth.uid()),
  'TEST-DEVICE-001',
  'Test Device',
  'active'
);

-- Expected result: SUCCESS / device created
-- Reason: Device INSERT policy WITH CHECK passes:
--   organization_id IN (
--     SELECT organization_id FROM profiles
--     WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
--   ) ✓
-- User is ADMIN in their org, can create devices

-- ============================================================================
-- TEST J: Invalid Device Creation by Responder - RESPONDER Cannot Create
-- ============================================================================
-- Scenario: RESPONDER user attempts to create a device (not authorized)
-- Expected: INSERT fails (denied by RLS)

-- As user_a (RESPONDER in Org A):
INSERT INTO devices (organization_id, device_code, name, status)
VALUES (
  (SELECT organization_id FROM profiles WHERE id = auth.uid()),
  'TEST-DEVICE-002',
  'Test Device 2',
  'active'
);

-- Expected result: DENIED
-- Reason: Device INSERT policy checks:
--   role IN ('ADMIN', 'SUPERVISOR')
-- User is RESPONDER, does not satisfy role check
-- RLS denies the insert

-- ============================================================================
-- TEST K: Constraint Violation - Invalid Device Status
-- ============================================================================
-- Scenario: ADMIN attempts to create device with invalid status
-- Expected: INSERT fails (violates CHECK constraint)

-- As user_admin_a (ADMIN in Org A):
INSERT INTO devices (organization_id, device_code, name, status)
VALUES (
  (SELECT organization_id FROM profiles WHERE id = auth.uid()),
  'TEST-DEVICE-003',
  'Invalid Status Device',
  'broken'  -- Invalid status (not in valid set)
);

-- Expected result: CONSTRAINT VIOLATION / INSERT fails
-- Reason: CHECK constraint on devices.status:
--   status IN ('active', 'inactive', 'error')
-- 'broken' is not in valid set
-- Database rejects the insert

-- ============================================================================
-- TEST L: Constraint Violation - Invalid Latitude
-- ============================================================================
-- Scenario: Attempt to create device with invalid latitude
-- Expected: INSERT fails (violates CHECK constraint)

-- As user_admin_a (ADMIN in Org A):
INSERT INTO devices (organization_id, device_code, name, status, latitude)
VALUES (
  (SELECT organization_id FROM profiles WHERE id = auth.uid()),
  'TEST-DEVICE-004',
  'Invalid Lat Device',
  'active',
  999.5  -- Invalid latitude (outside -90 to 90 range)
);

-- Expected result: CONSTRAINT VIOLATION / INSERT fails
-- Reason: CHECK constraint on devices.latitude:
--   latitude IS NULL OR (latitude >= -90 AND latitude <= 90)
-- 999.5 is outside valid range
-- Database rejects the insert

-- ============================================================================
-- TEST M: Responder Creation by Admin - ADMIN Can Create Responder
-- ============================================================================
-- Scenario: ADMIN creates a responder record
-- Expected: INSERT succeeds (INSERT has no explicit policy, defaults to DENY for anon)
-- Note: This may require service role access

-- As user_admin_a (ADMIN in Org A):
-- Attempt to create responder (may fail if no INSERT policy exists)
-- This is expected to fail for anon key - service role should create responders

INSERT INTO responders (profile_id, organization_id, status)
VALUES (
  'some-profile-id',
  (SELECT organization_id FROM profiles WHERE id = auth.uid()),
  'available'
);

-- Expected result: DENIED (no INSERT policy on responders)
-- This operation should be admin-only via service role
-- Not available to regular authenticated users

-- ============================================================================
-- SUMMARY OF EXPECTED BEHAVIORS
-- ============================================================================
-- PASS: Tests A, B, C, D, E, F, G (all attacks DENIED)
-- PASS: Tests H, I (legitimate operations ALLOWED)
-- PASS: Tests J (unauthorized operation DENIED)
-- PASS: Tests K, L (constraint violations REJECTED)
-- EXPECTED: Test M (INSERT responder denied - admin-only via service role)
--
-- If all tests pass as expected, the critical security vulnerabilities
-- have been successfully remediated.
