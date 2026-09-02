# Supabase Migrations — Ready to Apply

**Project**: mfekwhqgagdbpsacfrvtn  
**URL**: https://app.supabase.com

## Quick Start (5 minutes)

1. Go to https://app.supabase.com
2. Select project: **mfekwhqgagdbpsacfrvtn**
3. Click **SQL Editor** (left sidebar)
4. For each migration below (001 → 009):
   - Click **New Query**
   - Copy the SQL from the section
   - Paste into the editor
   - Click **Execute** (▶️)
   - Verify no errors in results

---

## Migration 001: Initial Schema

Creates: organizations, profiles, devices, responders tables with RLS policies.

**Copy and paste this entire block:**

```sql
-- Create organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SUPERVISOR', 'RESPONDER', 'WORKER')),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create devices table
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_code TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  battery_level NUMERIC,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create responders table
CREATE TABLE responders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  specializations TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_devices_organization_id ON devices(organization_id);
CREATE INDEX idx_devices_device_code ON devices(device_code);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);
CREATE INDEX idx_responders_organization_id ON responders(organization_id);
CREATE INDEX idx_responders_profile_id ON responders(profile_id);
CREATE INDEX idx_responders_status ON responders(status);

-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE responders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
CREATE POLICY "users_view_own_organization" ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for profiles
CREATE POLICY "users_view_organization_profiles" ON profiles
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- RLS Policies for devices
CREATE POLICY "users_view_organization_devices" ON devices
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_create_organization_devices" ON devices
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

CREATE POLICY "users_update_organization_devices" ON devices
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- RLS Policies for responders
CREATE POLICY "users_view_organization_responders" ON responders
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_update_organization_responders" ON responders
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- Grant public access to necessary functions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
```

✅ **Expected result**: No errors, query executed successfully

---

## Migration 002: Security Fixes

Fixes RLS vulnerabilities: prevents unauthorized org modifications, restricts profile updates.

**Copy and paste:**

```sql
-- FIX #1-3: Organizations Table - Add Missing Policies
CREATE POLICY "prevent_unauthorized_organization_insert" ON organizations
  FOR INSERT WITH CHECK (false);

CREATE POLICY "prevent_unauthorized_organization_update" ON organizations
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "prevent_unauthorized_organization_delete" ON organizations
  FOR DELETE USING (false);

-- FIX #4-5: Profiles Table - Restrict UPDATE to Non-Sensitive Fields
DROP POLICY "users_update_own_profile" ON profiles;

CREATE POLICY "users_update_own_profile_safe" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    role = (SELECT role FROM profiles WHERE id = auth.uid()) AND
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- FIX #6: Database Constraints - Validate Enum-like Fields
ALTER TABLE devices ADD CONSTRAINT valid_device_status
  CHECK (status IN ('active', 'inactive', 'error'));

ALTER TABLE responders ADD CONSTRAINT valid_responder_status
  CHECK (status IN ('available', 'responding', 'unavailable', 'off_duty'));

-- FIX #7: Database Constraints - Validate Geographic Coordinates
ALTER TABLE devices ADD CONSTRAINT valid_latitude
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));

ALTER TABLE devices ADD CONSTRAINT valid_longitude
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

ALTER TABLE responders ADD CONSTRAINT valid_responder_latitude
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));

ALTER TABLE responders ADD CONSTRAINT valid_responder_longitude
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- FIX #8: Explicit INSERT Policy for Profiles
CREATE POLICY "allow_authenticated_profile_insert" ON profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());
```

✅ **Expected result**: No errors

---

## Migration 003: Incident Engine

Creates incidents, incident_events (immutable), and incident_responders tables.

**Copy and paste:**

```sql
-- ============================================================================
-- INCIDENTS TABLE
-- ============================================================================

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('FIRE', 'MEDICAL', 'GAS_LEAK', 'ELECTRICAL', 'ACCIDENT', 'SECURITY', 'OTHER')),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL CHECK (status IN ('DETECTED', 'VERIFYING', 'VERIFIED', 'DISPATCHED', 'RESPONDING', 'RESOLVED', 'FALSE_ALARM')),
  title TEXT NOT NULL,
  description TEXT,
  latitude NUMERIC CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude NUMERIC CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_incidents_organization_id ON incidents(organization_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_device_id ON incidents(device_id);
CREATE INDEX idx_incidents_created_at ON incidents(created_at DESC);

-- ============================================================================
-- INCIDENT EVENTS TABLE (Immutable Event Log)
-- ============================================================================

CREATE TABLE incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('INCIDENT_CREATED', 'INCIDENT_VERIFICATION_STARTED', 'INCIDENT_VERIFIED', 'INCIDENT_MARKED_FALSE_ALARM', 'INCIDENT_DISPATCHED', 'RESPONDER_ACCEPTED', 'RESPONDER_ARRIVED', 'INCIDENT_RESOLVED')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_incident_events_incident_id ON incident_events(incident_id);
CREATE INDEX idx_incident_events_organization_id ON incident_events(organization_id);
CREATE INDEX idx_incident_events_event_type ON incident_events(event_type);
CREATE INDEX idx_incident_events_created_at ON incident_events(created_at DESC);

-- ============================================================================
-- INCIDENT RESPONDERS TABLE
-- ============================================================================

CREATE TABLE incident_responders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL REFERENCES responders(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ASSIGNED', 'ACCEPTED', 'DECLINED', 'ARRIVED', 'COMPLETED')),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_incident_responders_incident_id ON incident_responders(incident_id);
CREATE INDEX idx_incident_responders_responder_id ON incident_responders(responder_id);
CREATE INDEX idx_incident_responders_organization_id ON incident_responders(organization_id);
CREATE INDEX idx_incident_responders_status ON incident_responders(status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_responders ENABLE ROW LEVEL SECURITY;

-- INCIDENTS TABLE POLICIES
CREATE POLICY "users_view_organization_incidents" ON incidents
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_create_incidents" ON incidents
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_update_incidents" ON incidents
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- INCIDENT EVENTS TABLE POLICIES (Immutable event log)
CREATE POLICY "users_view_organization_incident_events" ON incident_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_create_incident_events" ON incident_events
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

CREATE POLICY "prevent_event_modification" ON incident_events
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "prevent_event_deletion" ON incident_events
  FOR DELETE USING (false);

-- INCIDENT RESPONDERS TABLE POLICIES
CREATE POLICY "users_view_organization_incident_responders" ON incident_responders
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "users_manage_incident_responders" ON incident_responders
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

CREATE POLICY "users_update_incident_responder_status" ON incident_responders
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    ) AND
    responder_id IN (
      SELECT id FROM responders WHERE profile_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    ) AND
    responder_id IN (
      SELECT id FROM responders WHERE profile_id = auth.uid()
    )
  );
```

✅ **Expected result**: No errors, 3 tables created

---

## Migration 004: Incident Transitions RPC

Creates atomic state machine functions for incident transitions.

**Copy and paste:**

```sql
-- ============================================================================
-- TRANSITION VALIDATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION is_valid_incident_transition(
  p_current_status TEXT,
  p_target_status TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN CASE p_current_status
    WHEN 'DETECTED' THEN p_target_status IN ('VERIFYING', 'FALSE_ALARM')
    WHEN 'VERIFYING' THEN p_target_status IN ('VERIFIED', 'FALSE_ALARM')
    WHEN 'VERIFIED' THEN p_target_status = 'DISPATCHED'
    WHEN 'DISPATCHED' THEN p_target_status IN ('RESPONDING', 'FALSE_ALARM')
    WHEN 'RESPONDING' THEN p_target_status IN ('RESOLVED', 'FALSE_ALARM')
    WHEN 'RESOLVED' THEN FALSE
    WHEN 'FALSE_ALARM' THEN FALSE
    ELSE FALSE
  END;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- ATOMIC TRANSITION: DETECTED → VERIFYING
-- ============================================================================

CREATE OR REPLACE FUNCTION transition_incident_to_verifying(
  p_incident_id UUID,
  p_organization_id UUID,
  p_actor_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  incident_id UUID,
  new_status TEXT,
  event_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_incident_status TEXT;
  v_event_id UUID;
  v_incident_rec RECORD;
BEGIN
  SELECT id, status INTO v_incident_rec
  FROM incidents
  WHERE id = p_incident_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_incident_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 'Incident not found'::TEXT;
    RETURN;
  END IF;

  v_incident_status := v_incident_rec.status;

  IF NOT is_valid_incident_transition(v_incident_status, 'VERIFYING') THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID,
      format('Cannot start verification from %s', v_incident_status)::TEXT;
    RETURN;
  END IF;

  UPDATE incidents
  SET status = 'VERIFYING', updated_at = now()
  WHERE id = p_incident_id;

  INSERT INTO incident_events (incident_id, organization_id, event_type, actor_id, metadata)
  VALUES (p_incident_id, p_organization_id, 'INCIDENT_VERIFICATION_STARTED', p_actor_id, '{}'::JSONB)
  RETURNING incident_events.id INTO v_event_id;

  RETURN QUERY SELECT TRUE, p_incident_id::UUID, 'VERIFYING'::TEXT, v_event_id::UUID, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ATOMIC TRANSITION: VERIFYING → VERIFIED
-- ============================================================================

CREATE OR REPLACE FUNCTION transition_incident_to_verified(
  p_incident_id UUID,
  p_organization_id UUID,
  p_actor_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  incident_id UUID,
  new_status TEXT,
  event_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_incident_status TEXT;
  v_event_id UUID;
  v_incident_rec RECORD;
BEGIN
  SELECT id, status INTO v_incident_rec
  FROM incidents
  WHERE id = p_incident_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_incident_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 'Incident not found'::TEXT;
    RETURN;
  END IF;

  v_incident_status := v_incident_rec.status;

  IF NOT is_valid_incident_transition(v_incident_status, 'VERIFIED') THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID,
      format('Cannot mark verified from %s', v_incident_status)::TEXT;
    RETURN;
  END IF;

  UPDATE incidents
  SET status = 'VERIFIED', verified_at = now(), updated_at = now()
  WHERE id = p_incident_id;

  INSERT INTO incident_events (incident_id, organization_id, event_type, actor_id, metadata)
  VALUES (p_incident_id, p_organization_id, 'INCIDENT_VERIFIED', p_actor_id, '{}'::JSONB)
  RETURNING incident_events.id INTO v_event_id;

  RETURN QUERY SELECT TRUE, p_incident_id::UUID, 'VERIFIED'::TEXT, v_event_id::UUID, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ATOMIC TRANSITION: any → FALSE_ALARM
-- ============================================================================

CREATE OR REPLACE FUNCTION transition_incident_to_false_alarm(
  p_incident_id UUID,
  p_organization_id UUID,
  p_actor_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  incident_id UUID,
  new_status TEXT,
  event_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_incident_status TEXT;
  v_event_id UUID;
  v_incident_rec RECORD;
BEGIN
  SELECT id, status INTO v_incident_rec
  FROM incidents
  WHERE id = p_incident_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_incident_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 'Incident not found'::TEXT;
    RETURN;
  END IF;

  v_incident_status := v_incident_rec.status;

  IF NOT is_valid_incident_transition(v_incident_status, 'FALSE_ALARM') THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID,
      format('Cannot mark false alarm from %s', v_incident_status)::TEXT;
    RETURN;
  END IF;

  UPDATE incidents
  SET status = 'FALSE_ALARM', resolved_at = now(), updated_at = now()
  WHERE id = p_incident_id;

  INSERT INTO incident_events (incident_id, organization_id, event_type, actor_id, metadata)
  VALUES (p_incident_id, p_organization_id, 'INCIDENT_MARKED_FALSE_ALARM', p_actor_id, '{}'::JSONB)
  RETURNING incident_events.id INTO v_event_id;

  RETURN QUERY SELECT TRUE, p_incident_id::UUID, 'FALSE_ALARM'::TEXT, v_event_id::UUID, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ATOMIC TRANSITION: VERIFIED → DISPATCHED (with responder assignments)
-- ============================================================================

CREATE OR REPLACE FUNCTION transition_incident_to_dispatched(
  p_incident_id UUID,
  p_organization_id UUID,
  p_actor_id UUID,
  p_responder_ids UUID[]
) RETURNS TABLE (
  success BOOLEAN,
  incident_id UUID,
  new_status TEXT,
  event_id UUID,
  assignment_count INT,
  error_message TEXT
) AS $$
DECLARE
  v_incident_status TEXT;
  v_event_id UUID;
  v_assignment_count INT;
  v_incident_rec RECORD;
BEGIN
  SELECT id, status INTO v_incident_rec
  FROM incidents
  WHERE id = p_incident_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_incident_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 0::INT, 'Incident not found'::TEXT;
    RETURN;
  END IF;

  v_incident_status := v_incident_rec.status;

  IF NOT is_valid_incident_transition(v_incident_status, 'DISPATCHED') THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 0::INT,
      format('Cannot dispatch from %s', v_incident_status)::TEXT;
    RETURN;
  END IF;

  IF array_length(p_responder_ids, 1) IS NULL OR array_length(p_responder_ids, 1) = 0 THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 0::INT, 'No responders provided'::TEXT;
    RETURN;
  END IF;

  UPDATE incidents
  SET status = 'DISPATCHED', dispatched_at = now(), updated_at = now()
  WHERE id = p_incident_id;

  INSERT INTO incident_events (incident_id, organization_id, event_type, actor_id, metadata)
  VALUES (
    p_incident_id,
    p_organization_id,
    'INCIDENT_DISPATCHED',
    p_actor_id,
    jsonb_build_object('responder_count', array_length(p_responder_ids, 1))
  )
  RETURNING incident_events.id INTO v_event_id;

  INSERT INTO incident_responders (incident_id, responder_id, organization_id, status)
  SELECT p_incident_id, r.id, p_organization_id, 'ASSIGNED'
  FROM UNNEST(p_responder_ids) AS responder_id
  JOIN responders r ON r.id = responder_id AND r.organization_id = p_organization_id;

  GET DIAGNOSTICS v_assignment_count = ROW_COUNT;

  IF v_assignment_count < array_length(p_responder_ids, 1) THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, v_assignment_count::INT,
      'Some responders do not belong to the organization'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, p_incident_id::UUID, 'DISPATCHED'::TEXT, v_event_id::UUID, v_assignment_count::INT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ATOMIC TRANSITION: DISPATCHED → RESPONDING
-- ============================================================================

CREATE OR REPLACE FUNCTION transition_incident_to_responding(
  p_incident_id UUID,
  p_organization_id UUID,
  p_actor_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  incident_id UUID,
  new_status TEXT,
  event_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_incident_status TEXT;
  v_event_id UUID;
  v_incident_rec RECORD;
BEGIN
  SELECT id, status INTO v_incident_rec
  FROM incidents
  WHERE id = p_incident_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_incident_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 'Incident not found'::TEXT;
    RETURN;
  END IF;

  v_incident_status := v_incident_rec.status;

  IF NOT is_valid_incident_transition(v_incident_status, 'RESPONDING') THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID,
      format('Cannot respond from %s', v_incident_status)::TEXT;
    RETURN;
  END IF;

  UPDATE incidents
  SET status = 'RESPONDING', updated_at = now()
  WHERE id = p_incident_id;

  INSERT INTO incident_events (incident_id, organization_id, event_type, actor_id, metadata)
  VALUES (p_incident_id, p_organization_id, 'RESPONDER_ARRIVED', p_actor_id, '{}'::JSONB)
  RETURNING incident_events.id INTO v_event_id;

  RETURN QUERY SELECT TRUE, p_incident_id::UUID, 'RESPONDING'::TEXT, v_event_id::UUID, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ATOMIC TRANSITION: RESPONDING → RESOLVED
-- ============================================================================

CREATE OR REPLACE FUNCTION transition_incident_to_resolved(
  p_incident_id UUID,
  p_organization_id UUID,
  p_actor_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  incident_id UUID,
  new_status TEXT,
  event_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_incident_status TEXT;
  v_event_id UUID;
  v_incident_rec RECORD;
BEGIN
  SELECT id, status INTO v_incident_rec
  FROM incidents
  WHERE id = p_incident_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_incident_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 'Incident not found'::TEXT;
    RETURN;
  END IF;

  v_incident_status := v_incident_rec.status;

  IF NOT is_valid_incident_transition(v_incident_status, 'RESOLVED') THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID,
      format('Cannot resolve from %s', v_incident_status)::TEXT;
    RETURN;
  END IF;

  UPDATE incidents
  SET status = 'RESOLVED', resolved_at = now(), updated_at = now()
  WHERE id = p_incident_id;

  INSERT INTO incident_events (incident_id, organization_id, event_type, actor_id, metadata)
  VALUES (p_incident_id, p_organization_id, 'INCIDENT_RESOLVED', p_actor_id, '{}'::JSONB)
  RETURNING incident_events.id INTO v_event_id;

  RETURN QUERY SELECT TRUE, p_incident_id::UUID, 'RESOLVED'::TEXT, v_event_id::UUID, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ATOMIC TRANSITION: Update Responder Status
-- ============================================================================

CREATE OR REPLACE FUNCTION update_responder_assignment_status(
  p_assignment_id UUID,
  p_new_status TEXT,
  p_actor_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  assignment_id UUID,
  new_status TEXT,
  event_id UUID,
  event_type TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_event_id UUID;
  v_event_type TEXT;
  v_assignment_rec RECORD;
  v_update_cols TEXT;
BEGIN
  IF p_new_status NOT IN ('ACCEPTED', 'DECLINED', 'ARRIVED', 'COMPLETED') THEN
    RETURN QUERY SELECT FALSE, p_assignment_id::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'Invalid status'::TEXT;
    RETURN;
  END IF;

  SELECT id, incident_id, organization_id, responder_id INTO v_assignment_rec
  FROM incident_responders
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_assignment_id::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'Assignment not found'::TEXT;
    RETURN;
  END IF;

  CASE p_new_status
    WHEN 'ACCEPTED' THEN
      UPDATE incident_responders
      SET status = 'ACCEPTED', accepted_at = now(), updated_at = now()
      WHERE id = p_assignment_id;
      v_event_type := 'RESPONDER_ACCEPTED';
    WHEN 'ARRIVED' THEN
      UPDATE incident_responders
      SET status = 'ARRIVED', arrived_at = now(), updated_at = now()
      WHERE id = p_assignment_id;
      v_event_type := 'RESPONDER_ARRIVED';
    WHEN 'COMPLETED' THEN
      UPDATE incident_responders
      SET status = 'COMPLETED', updated_at = now()
      WHERE id = p_assignment_id;
      v_event_type := 'INCIDENT_RESOLVED';
    WHEN 'DECLINED' THEN
      UPDATE incident_responders
      SET status = 'DECLINED', updated_at = now()
      WHERE id = p_assignment_id;
      v_event_type := 'RESPONDER_DECLINED';
    ELSE
      RETURN QUERY SELECT FALSE, p_assignment_id::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'Invalid status'::TEXT;
      RETURN;
  END CASE;

  INSERT INTO incident_events (
    incident_id,
    organization_id,
    event_type,
    actor_id,
    metadata
  )
  VALUES (
    v_assignment_rec.incident_id,
    v_assignment_rec.organization_id,
    v_event_type,
    p_actor_id,
    jsonb_build_object('responder_id', v_assignment_rec.responder_id)
  )
  RETURNING incident_events.id INTO v_event_id;

  RETURN QUERY SELECT TRUE, p_assignment_id::UUID, p_new_status::TEXT, v_event_id::UUID, v_event_type::TEXT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;
```

✅ **Expected result**: No errors, 7 functions created

---

## Migration 005: Signal Events & Detection

Creates signal_events, signal_detections, and deduplication tables.

**Copy and paste:**

```sql
-- ============================================================================
-- Signal Events Table
-- ============================================================================

CREATE TABLE signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('MOBILE', 'REACT_NODE', 'DASHBOARD')),
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'SOS',
    'PANIC_BUTTON',
    'IMPACT',
    'SMOKE',
    'GAS',
    'TEMPERATURE',
    'MOTION',
    'MANUAL_REPORT',
    'UNKNOWN'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  latitude NUMERIC CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude NUMERIC CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Indexes for Query Performance
-- ============================================================================

CREATE INDEX idx_signal_events_organization_id ON signal_events(organization_id);
CREATE INDEX idx_signal_events_created_at ON signal_events(created_at DESC);
CREATE INDEX idx_signal_events_occurred_at ON signal_events(occurred_at DESC);
CREATE INDEX idx_signal_events_signal_type ON signal_events(signal_type);
CREATE INDEX idx_signal_events_device_id ON signal_events(device_id);
CREATE INDEX idx_signal_events_org_type_created ON signal_events(organization_id, signal_type, created_at DESC);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE signal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_org_signals" ON signal_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "authenticated_insert_signals" ON signal_events
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "prevent_update_signals" ON signal_events
  FOR UPDATE
  USING (FALSE);

CREATE POLICY "prevent_delete_signals" ON signal_events
  FOR DELETE
  USING (FALSE);

-- ============================================================================
-- Detection Decision Cache
-- ============================================================================

CREATE TABLE signal_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_event_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'INCIDENT_CANDIDATE',
    'MONITORING',
    'RECORD_ONLY',
    'DUPLICATE',
    'INVALID'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  requires_verification BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL,
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  recommended_incident_type TEXT,
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signal_detections_organization_id ON signal_detections(organization_id);
CREATE INDEX idx_signal_detections_signal_event_id ON signal_detections(signal_event_id);
CREATE INDEX idx_signal_detections_incident_id ON signal_detections(incident_id);
CREATE INDEX idx_signal_detections_created_at ON signal_detections(created_at DESC);
CREATE INDEX idx_signal_detections_action ON signal_detections(action);

ALTER TABLE signal_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_org_detections" ON signal_detections
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- Deduplication Tracking (for flood protection)
-- ============================================================================

CREATE TABLE signal_deduplication_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  last_signal_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,
  last_occurred_at TIMESTAMPTZ NOT NULL,
  duplicate_count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, device_id, signal_type)
);

CREATE INDEX idx_signal_dedup_org_device ON signal_deduplication_state(organization_id, device_id);
CREATE INDEX idx_signal_dedup_updated_at ON signal_deduplication_state(updated_at);

ALTER TABLE signal_deduplication_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_org_dedup_state" ON signal_deduplication_state
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- Add source_signal_id to incidents for traceability
-- ============================================================================

ALTER TABLE incidents
ADD COLUMN source_signal_id UUID REFERENCES signal_events(id) ON DELETE SET NULL;

CREATE INDEX idx_incidents_source_signal_id ON incidents(source_signal_id);
```

✅ **Expected result**: No errors, 3 new tables created

---

## Migration 006: Signal-Incident Correlation

Creates correlation configuration and tracking tables for deduplication.

**Copy and paste:**

```sql
-- ============================================================================
-- SIGNAL CORRELATION CONFIGURATION
-- ============================================================================

CREATE TABLE correlation_config (
  key TEXT PRIMARY KEY,
  value_ms INT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO correlation_config (key, value_ms, description)
VALUES (
  'signal_correlation_window_ms',
  30000,
  'Time window for correlating repeated signals to same incident (milliseconds)'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- SIGNAL-TO-INCIDENT CORRELATION TABLE
-- ============================================================================

CREATE TABLE signal_incident_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signal_event_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  correlation_reason TEXT NOT NULL,
  correlated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (signal_event_id)
);

CREATE INDEX idx_correlations_org_id ON signal_incident_correlations(organization_id);
CREATE INDEX idx_correlations_signal_id ON signal_incident_correlations(signal_event_id);
CREATE INDEX idx_correlations_incident_id ON signal_incident_correlations(incident_id);
CREATE INDEX idx_correlations_correlated_at ON signal_incident_correlations(correlated_at);

ALTER TABLE signal_incident_correlations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_org_correlations" ON signal_incident_correlations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- CORRELATION DECISION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION can_correlate_signal(
  p_signal_type TEXT,
  p_incident_status TEXT,
  p_incident_type TEXT,
  p_time_since_incident_created_ms INT
) RETURNS TABLE (
  should_correlate BOOLEAN,
  reason TEXT
) AS $$
BEGIN
  IF p_signal_type IN ('SOS', 'PANIC_BUTTON') THEN
    IF p_incident_status IN ('RESOLVED', 'FALSE_ALARM') THEN
      RETURN QUERY SELECT FALSE, 'Critical signal cannot correlate to ' || p_incident_status || ' incident'::TEXT;
      RETURN;
    END IF;
    RETURN QUERY SELECT TRUE, 'Critical signal correlates to active ' || p_incident_status || ' incident'::TEXT;
    RETURN;
  END IF;

  IF p_signal_type IN ('IMPACT', 'SMOKE', 'GAS', 'MANUAL_REPORT') THEN
    IF p_incident_status IN ('RESOLVED', 'FALSE_ALARM') THEN
      RETURN QUERY SELECT FALSE, 'Signal cannot correlate to ' || p_incident_status || ' incident'::TEXT;
      RETURN;
    END IF;
    RETURN QUERY SELECT TRUE, p_signal_type || ' signal correlates to active incident'::TEXT;
    RETURN;
  END IF;

  IF p_signal_type IN ('TEMPERATURE', 'MOTION', 'UNKNOWN') THEN
    RETURN QUERY SELECT FALSE, p_signal_type || ' signals do not correlate to incidents'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, 'No correlation rule for ' || p_signal_type || ' to ' || p_incident_status::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- INDEXES FOR EFFICIENT CORRELATION LOOKUPS
-- ============================================================================

CREATE INDEX idx_incidents_org_status_created ON incidents(
  organization_id, status, created_at DESC
) WHERE status NOT IN ('RESOLVED', 'FALSE_ALARM');

CREATE INDEX idx_correlations_org_signal_time ON signal_incident_correlations(
  organization_id, signal_event_id, correlated_at DESC
);
```

✅ **Expected result**: No errors

---

## Migration 007: Device Management

Creates device credentials, health, heartbeat, and configuration tables.

**Copy and paste:**

```sql
-- ============================================================================
-- DEVICE AUTHENTICATION & CREDENTIALS
-- ============================================================================

CREATE TABLE device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type IN ('API_KEY', 'JWT_TOKEN')),
  credential_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  UNIQUE (device_id, credential_type, revoked_at) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_device_creds_device_id ON device_credentials(device_id);
CREATE INDEX idx_device_creds_org_id ON device_credentials(organization_id);
CREATE INDEX idx_device_creds_hash ON device_credentials(credential_hash);
CREATE INDEX idx_device_creds_revoked ON device_credentials(revoked_at);

-- ============================================================================
-- DEVICE HEALTH & STATUS TRACKING
-- ============================================================================

CREATE TABLE device_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN (
    'ONLINE',
    'OFFLINE',
    'ERROR',
    'UNKNOWN'
  )),

  firmware_version TEXT,
  hardware_model TEXT,

  battery_level INT CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100)),
  battery_voltage_mv INT,
  charging BOOLEAN,

  wifi_rssi INT,
  wifi_ssid TEXT,

  device_temperature_c NUMERIC,
  uptime_seconds BIGINT,

  last_heartbeat_at TIMESTAMPTZ,
  last_heartbeat_latency_ms INT,

  last_error_message TEXT,
  last_error_at TIMESTAMPTZ,
  error_count_24h INT DEFAULT 0,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_health_device_id ON device_health(device_id);
CREATE INDEX idx_device_health_org_id ON device_health(organization_id);
CREATE INDEX idx_device_health_status ON device_health(status);
CREATE INDEX idx_device_health_last_heartbeat ON device_health(last_heartbeat_at DESC);
CREATE INDEX idx_device_health_updated ON device_health(updated_at DESC);

ALTER TABLE device_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_org_device_health" ON device_health
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- DEVICE SIGNAL IDEMPOTENCY
-- ============================================================================

CREATE TABLE device_signal_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  signal_event_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,

  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (device_id, event_id)
);

CREATE INDEX idx_signal_idem_device_id ON device_signal_idempotency(device_id);
CREATE INDEX idx_signal_idem_event_id ON device_signal_idempotency(event_id);
CREATE INDEX idx_signal_idem_received ON device_signal_idempotency(received_at DESC);

-- ============================================================================
-- DEVICE HEARTBEAT HISTORY
-- ============================================================================

CREATE TABLE device_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'TIMEOUT', 'ERROR', 'MALFORMED')),
  latency_ms INT,
  firmware_version TEXT,
  battery_level INT,
  signal_strength_rssi INT,
  error_message TEXT,

  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_heartbeats_device_id ON device_heartbeats(device_id);
CREATE INDEX idx_heartbeats_received ON device_heartbeats(received_at DESC);
CREATE INDEX idx_heartbeats_org_id ON device_heartbeats(organization_id);

ALTER TABLE device_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_org_heartbeats" ON device_heartbeats
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- DEVICE ENABLE/DISABLE STATE
-- ============================================================================

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================================
-- DEVICE CONFIGURATION
-- ============================================================================

CREATE TABLE device_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  config_key TEXT NOT NULL,
  config_value TEXT,

  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (device_id, config_key)
);

CREATE INDEX idx_device_config_device_id ON device_configuration(device_id);
CREATE INDEX idx_device_config_key ON device_configuration(config_key);

ALTER TABLE device_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_org_device_config" ON device_configuration
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- INDEXES FOR QUERY PERFORMANCE
-- ============================================================================

CREATE INDEX idx_devices_org_enabled ON devices(organization_id, enabled) WHERE enabled = true;

CREATE INDEX idx_device_health_org_status_updated ON device_health(
  organization_id, status, updated_at DESC
);

-- ============================================================================
-- RLS POLICIES FOR DEVICE MANAGEMENT
-- ============================================================================

ALTER TABLE device_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_verify_credentials" ON device_credentials
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
```

✅ **Expected result**: No errors, 4 new tables created

---

## Migration 008: M5 Coordination

Adds responder availability and incident coordination views.

**Copy and paste:**

```sql
-- ============================================================================
-- RESPONDER AVAILABILITY ENHANCEMENT
-- ============================================================================

ALTER TABLE responders ADD COLUMN IF NOT EXISTS availability TEXT CHECK (availability IN ('AVAILABLE', 'RESPONDING', 'UNAVAILABLE', 'OFF_DUTY')) DEFAULT 'AVAILABLE';

ALTER TABLE responders ADD COLUMN IF NOT EXISTS last_status_update TIMESTAMPTZ DEFAULT now();

ALTER TABLE responders ADD COLUMN IF NOT EXISTS contact_metadata JSONB DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_responders_availability ON responders(organization_id, availability);

-- ============================================================================
-- INCIDENT COUNTERS AND CATEGORIZATION (views for performance)
-- ============================================================================

CREATE OR REPLACE VIEW vw_incident_status_summary AS
SELECT
  i.organization_id,
  i.status,
  COUNT(*) as count
FROM incidents i
WHERE i.status NOT IN ('RESOLVED', 'FALSE_ALARM')
GROUP BY i.organization_id, i.status;

CREATE OR REPLACE VIEW vw_incident_severity_summary AS
SELECT
  i.organization_id,
  i.severity,
  COUNT(*) as count
FROM incidents i
WHERE i.status NOT IN ('RESOLVED', 'FALSE_ALARM')
GROUP BY i.organization_id, i.severity;

CREATE OR REPLACE VIEW vw_responder_availability_summary AS
SELECT
  r.organization_id,
  r.availability,
  COUNT(*) as count
FROM responders r
WHERE r.profile_id IN (SELECT id FROM profiles WHERE role IN ('ADMIN', 'SUPERVISOR', 'RESPONDER'))
GROUP BY r.organization_id, r.availability;

CREATE OR REPLACE VIEW vw_incident_response_metrics AS
SELECT
  i.organization_id,
  i.id as incident_id,
  i.status,
  i.detected_at,
  i.verified_at,
  i.dispatched_at,
  EXTRACT(EPOCH FROM (i.verified_at - i.detected_at)) / 1000 as detection_to_verification_ms,
  EXTRACT(EPOCH FROM (i.dispatched_at - i.verified_at)) / 1000 as verification_to_dispatch_ms,
  EXTRACT(EPOCH FROM (COALESCE(i.resolved_at, NOW()) - i.detected_at)) / 1000 as total_duration_ms
FROM incidents i;

-- ============================================================================
-- ROW LEVEL SECURITY UPDATES
-- ============================================================================

CREATE POLICY IF NOT EXISTS "responders_update_own_availability" ON responders
  FOR UPDATE
  USING (
    profile_id = auth.uid()
  )
  WITH CHECK (
    profile_id = auth.uid()
  );

CREATE POLICY IF NOT EXISTS "supervisors_update_responder_availability" ON responders
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- ============================================================================
-- INDEXES FOR REAL-TIME QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_incident_responders_responder_id ON incident_responders(responder_id);
CREATE INDEX IF NOT EXISTS idx_incident_responders_assigned_at ON incident_responders(assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_events_actor_id ON incident_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status_org_created ON incidents(organization_id, status, created_at DESC);
```

✅ **Expected result**: No errors, views created

---

## Migration 009: Responder Status Updates

Adds RESPONDING status to responder state machine.

**Copy and paste:**

```sql
-- ============================================================================
-- INCIDENT RESPONDERS STATUS UPDATE
-- ============================================================================

ALTER TABLE incident_responders
  DROP CONSTRAINT incident_responders_status_check;

ALTER TABLE incident_responders
  ADD CONSTRAINT incident_responders_status_check
  CHECK (status IN ('ASSIGNED', 'ACCEPTED', 'DECLINED', 'RESPONDING', 'ARRIVED', 'COMPLETED'));

ALTER TABLE incident_responders ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_incident_responders_status_responded_at
ON incident_responders(status, responded_at DESC)
WHERE status = 'RESPONDING';
```

✅ **Expected result**: No errors

---

## Verification

After applying all 9 migrations:

```bash
# Test database connection
npm test -- __tests__/integration-setup.test.ts --testNamePattern="getTestEnv"

# Run all tests (should show 235 passing, 55 skipped)
npm test

# Test specific integration suite
npm test -- __tests__/m5-responder-actions.test.ts
```

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "relation already exists" | Migration already applied | Skip it, proceed to next |
| "Cannot find table" | A previous migration failed | Go back and verify all prior migrations passed |
| "Invalid token" in test | Credentials not loaded | Verify `.env.local` exists and Supabase URL is correct |

---

## Timeline

✅ Code inspection complete  
✅ .env.local configured  
⏳ **Apply 9 migrations** (you are here) — ~5 minutes  
⏳ Run integration tests — ~2 minutes  
⏳ Phase 2 validation — ~10 minutes  

**Total**: ~30 minutes to Phase 2 complete
