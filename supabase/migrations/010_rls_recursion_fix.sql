-- RE:ACT — Fix infinite recursion in row-level security, and allow RESPONDER_DECLINED
--
-- PROBLEM 1: infinite recursion in policy for relation "profiles"
--   Migration 001 defines the profiles SELECT policy as:
--     USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
--   Reading profiles evaluates that policy, whose subquery reads profiles, which
--   evaluates the policy again. PostgreSQL aborts with:
--     ERROR: infinite recursion detected in policy for relation "profiles"
--
--   Because 22 other policies resolve the caller's org with the same subquery
--   against profiles, this propagates to EVERY organization-scoped table:
--   incidents, organizations, responders, devices, signal_events, and the rest
--   are all unreadable by any authenticated user. Only the service_role key
--   works, since it bypasses RLS -- which is why server-side code can appear
--   healthy while the browser renders nothing.
--
--   FIX: resolve the caller's org/role through SECURITY DEFINER functions. They
--   run with the definer's rights, so RLS is not re-evaluated inside them and
--   the cycle is broken. Rewriting the profiles SELECT policy alone is enough --
--   the other 22 policies then resolve normally through the fixed policy.
--
-- PROBLEM 2: RESPONDER_DECLINED violates a CHECK constraint
--   update_responder_assignment_status (migration 004) writes an event of type
--   'RESPONDER_DECLINED', but the incident_events.event_type CHECK constraint
--   (migration 003) does not list it. Any responder declining an assignment
--   fails with a constraint violation. ACCEPTED / ARRIVED / COMPLETED work.

-- ============================================================================
-- 1. Helpers that read profiles without re-triggering RLS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT organization_id FROM profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT role FROM profiles WHERE id = auth.uid() $$;

GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated;

-- ============================================================================
-- 2. Rewrite the self-referential policies on profiles
--    This is the change that breaks the recursion cycle for the whole schema.
-- ============================================================================

DROP POLICY IF EXISTS "users_view_organization_profiles" ON profiles;
CREATE POLICY "users_view_organization_profiles" ON profiles
  FOR SELECT
  USING (organization_id = public.current_user_org_id());

-- Preserves the intent of migration 002: only full_name is really editable,
-- role and organization_id stay pinned to their current values.
DROP POLICY IF EXISTS "users_update_own_profile_safe" ON profiles;
CREATE POLICY "users_update_own_profile_safe" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = public.current_user_role()
    AND organization_id = public.current_user_org_id()
  );

-- ============================================================================
-- 3. organizations also self-joins profiles; same treatment
-- ============================================================================

DROP POLICY IF EXISTS "users_view_own_organization" ON organizations;
CREATE POLICY "users_view_own_organization" ON organizations
  FOR SELECT
  USING (id = public.current_user_org_id());

-- ============================================================================
-- 4. Allow the RESPONDER_DECLINED event that migration 004 already emits
-- ============================================================================

ALTER TABLE incident_events
  DROP CONSTRAINT incident_events_event_type_check;

ALTER TABLE incident_events
  ADD CONSTRAINT incident_events_event_type_check
  CHECK (event_type IN (
    'INCIDENT_CREATED',
    'INCIDENT_VERIFICATION_STARTED',
    'INCIDENT_VERIFIED',
    'INCIDENT_MARKED_FALSE_ALARM',
    'INCIDENT_DISPATCHED',
    'RESPONDER_ACCEPTED',
    'RESPONDER_DECLINED',
    'RESPONDER_ARRIVED',
    'INCIDENT_RESOLVED'
  ));
