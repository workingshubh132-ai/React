-- RE:ACT M5 — Real-Time Emergency Coordination
-- Enhances responder model and incident tracking for coordination features

-- ============================================================================
-- RESPONDER AVAILABILITY ENHANCEMENT
-- ============================================================================

-- Add explicit availability status to responders
ALTER TABLE responders ADD COLUMN IF NOT EXISTS availability TEXT CHECK (availability IN ('AVAILABLE', 'RESPONDING', 'UNAVAILABLE', 'OFF_DUTY')) DEFAULT 'AVAILABLE';

-- Add last status update timestamp
ALTER TABLE responders ADD COLUMN IF NOT EXISTS last_status_update TIMESTAMPTZ DEFAULT now();

-- Add contact/channel metadata for notifications
ALTER TABLE responders ADD COLUMN IF NOT EXISTS contact_metadata JSONB DEFAULT '{}'::JSONB;

-- Add index for availability queries (used in responder selection)
CREATE INDEX IF NOT EXISTS idx_responders_availability ON responders(organization_id, availability);

-- ============================================================================
-- INCIDENT COUNTERS AND CATEGORIZATION (views for performance)
-- ============================================================================

-- View: Active incidents by organization and status
CREATE OR REPLACE VIEW vw_incident_status_summary AS
SELECT
  i.organization_id,
  i.status,
  COUNT(*) as count
FROM incidents i
WHERE i.status NOT IN ('RESOLVED', 'FALSE_ALARM')
GROUP BY i.organization_id, i.status;

-- View: Active incidents by organization and severity
CREATE OR REPLACE VIEW vw_incident_severity_summary AS
SELECT
  i.organization_id,
  i.severity,
  COUNT(*) as count
FROM incidents i
WHERE i.status NOT IN ('RESOLVED', 'FALSE_ALARM')
GROUP BY i.organization_id, i.severity;

-- View: Responder availability summary
CREATE OR REPLACE VIEW vw_responder_availability_summary AS
SELECT
  r.organization_id,
  r.availability,
  COUNT(*) as count
FROM responders r
WHERE r.profile_id IN (SELECT id FROM profiles WHERE role IN ('ADMIN', 'SUPERVISOR', 'RESPONDER'))
GROUP BY r.organization_id, r.availability;

-- View: Response metrics
CREATE OR REPLACE VIEW vw_incident_response_metrics AS
SELECT
  i.organization_id,
  i.id as incident_id,
  i.status,
  i.detected_at,
  i.verified_at,
  i.dispatched_at,
  -- EXTRACT(EPOCH ...) yields SECONDS, so multiply by 1000 to get milliseconds
  EXTRACT(EPOCH FROM (i.verified_at - i.detected_at)) * 1000 as detection_to_verification_ms,
  EXTRACT(EPOCH FROM (i.dispatched_at - i.verified_at)) * 1000 as verification_to_dispatch_ms,
  EXTRACT(EPOCH FROM (COALESCE(i.resolved_at, NOW()) - i.detected_at)) * 1000 as total_duration_ms
FROM incidents i;

-- ============================================================================
-- ROW LEVEL SECURITY UPDATES
-- ============================================================================

-- NOTE: PostgreSQL has no IF NOT EXISTS clause for CREATE POLICY (through PG17).
-- These use DROP POLICY IF EXISTS + CREATE POLICY to stay re-runnable.

-- Responders can update their own availability status
DROP POLICY IF EXISTS "responders_update_own_availability" ON responders;
CREATE POLICY "responders_update_own_availability" ON responders
  FOR UPDATE
  USING (
    profile_id = auth.uid()
  )
  WITH CHECK (
    profile_id = auth.uid()
  );

-- Supervisors/Admins can update responder availability
DROP POLICY IF EXISTS "supervisors_update_responder_availability" ON responders;
CREATE POLICY "supervisors_update_responder_availability" ON responders
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
