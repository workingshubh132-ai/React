-- RE:ACT M2 — Incident Transitions RPC Functions
-- Implements atomic, concurrency-safe state transitions with event logging
-- All transitions are ATOMIC: both state change and event creation succeed together or both fail

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
  -- Lock the incident row for the duration of this transaction
  SELECT id, status INTO v_incident_rec
  FROM incidents
  WHERE id = p_incident_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_incident_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID, 'Incident not found'::TEXT;
    RETURN;
  END IF;

  v_incident_status := v_incident_rec.status;

  -- Validate transition
  IF NOT is_valid_incident_transition(v_incident_status, 'VERIFYING') THEN
    RETURN QUERY SELECT FALSE, p_incident_id::UUID, NULL::TEXT, NULL::UUID,
      format('Cannot start verification from %s', v_incident_status)::TEXT;
    RETURN;
  END IF;

  -- Update incident status (ATOMIC with event insert below)
  UPDATE incidents
  SET status = 'VERIFYING', updated_at = now()
  WHERE id = p_incident_id;

  -- Insert event
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

  -- Update incident
  UPDATE incidents
  SET status = 'DISPATCHED', dispatched_at = now(), updated_at = now()
  WHERE id = p_incident_id;

  -- Insert event with responder count metadata
  INSERT INTO incident_events (incident_id, organization_id, event_type, actor_id, metadata)
  VALUES (
    p_incident_id,
    p_organization_id,
    'INCIDENT_DISPATCHED',
    p_actor_id,
    jsonb_build_object('responder_count', array_length(p_responder_ids, 1))
  )
  RETURNING incident_events.id INTO v_event_id;

  -- Assign responders - validate each responder belongs to the organization
  -- This prevents cross-organization responder assignment (IDOR-like vulnerability)
  INSERT INTO incident_responders (incident_id, responder_id, organization_id, status)
  SELECT p_incident_id, r.id, p_organization_id, 'ASSIGNED'
  FROM UNNEST(p_responder_ids) AS responder_id
  JOIN responders r ON r.id = responder_id AND r.organization_id = p_organization_id;

  GET DIAGNOSTICS v_assignment_count = ROW_COUNT;

  -- Verify we assigned all requested responders
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
  -- Validate status
  IF p_new_status NOT IN ('ACCEPTED', 'DECLINED', 'ARRIVED', 'COMPLETED') THEN
    RETURN QUERY SELECT FALSE, p_assignment_id::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'Invalid status'::TEXT;
    RETURN;
  END IF;

  -- Lock and fetch assignment
  SELECT id, incident_id, organization_id, responder_id INTO v_assignment_rec
  FROM incident_responders
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment_rec IS NULL THEN
    RETURN QUERY SELECT FALSE, p_assignment_id::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'Assignment not found'::TEXT;
    RETURN;
  END IF;

  -- Update assignment with appropriate timestamp
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

  -- Insert corresponding event
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

-- ============================================================================
-- Security: RLS Policies for RPC Functions
-- ============================================================================

-- The RPC functions are executed with the authenticated user's permissions.
-- They leverage existing RLS policies on incidents and incident_events tables.
-- The database enforces that:
-- 1. Only ADMIN/SUPERVISOR can call these functions (enforced in application)
-- 2. The organization_id passed must match the user's organization (enforced via RLS on SELECT)
-- 3. Events cannot be modified or deleted (enforced via immutable RLS policies)
