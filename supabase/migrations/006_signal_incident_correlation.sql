-- RE:ACT M3 — Signal-Incident Correlation & Deduplication Remediation
-- Prevents duplicate incident creation from repeated critical signals
-- Correlates repeated signals to the active incident within correlation window

-- ============================================================================
-- SIGNAL CORRELATION CONFIGURATION
-- ============================================================================

-- Single source of truth for correlation window (30 seconds default, in milliseconds)
-- Can be updated at runtime without schema changes
CREATE TABLE IF NOT EXISTS correlation_config (
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

-- Track which signal events are correlated to which incident
-- A signal_event may be correlated to an incident if it occurs within
-- the correlation window and matches correlation criteria
CREATE TABLE signal_incident_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signal_event_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  correlation_reason TEXT NOT NULL,
  correlated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure one correlation per signal
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

-- Determine if a signal should be correlated to an existing incident
-- This function is deterministic and used by the application layer
-- It examines incident state and correlation rules

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
  -- Critical signals (SOS, PANIC_BUTTON) cannot correlate to RESOLVED or FALSE_ALARM
  IF p_signal_type IN ('SOS', 'PANIC_BUTTON') THEN
    IF p_incident_status IN ('RESOLVED', 'FALSE_ALARM') THEN
      RETURN QUERY SELECT FALSE, 'Critical signal cannot correlate to ' || p_incident_status || ' incident'::TEXT;
      RETURN;
    END IF;
    -- Can correlate to DETECTED, VERIFYING, VERIFIED, DISPATCHED, RESPONDING
    RETURN QUERY SELECT TRUE, 'Critical signal correlates to active ' || p_incident_status || ' incident'::TEXT;
    RETURN;
  END IF;

  -- Non-critical signals (IMPACT, SMOKE, GAS, etc.)
  IF p_signal_type IN ('IMPACT', 'SMOKE', 'GAS', 'MANUAL_REPORT') THEN
    -- Cannot correlate to RESOLVED or FALSE_ALARM
    IF p_incident_status IN ('RESOLVED', 'FALSE_ALARM') THEN
      RETURN QUERY SELECT FALSE, 'Signal cannot correlate to ' || p_incident_status || ' incident'::TEXT;
      RETURN;
    END IF;
    -- Can correlate if incident type matches (e.g., SMOKE → FIRE)
    -- For now, allow correlation to same incident type
    RETURN QUERY SELECT TRUE, p_signal_type || ' signal correlates to active incident'::TEXT;
    RETURN;
  END IF;

  -- Monitoring/reporting signals do not correlate
  IF p_signal_type IN ('TEMPERATURE', 'MOTION', 'UNKNOWN') THEN
    RETURN QUERY SELECT FALSE, p_signal_type || ' signals do not correlate to incidents'::TEXT;
    RETURN;
  END IF;

  -- Default: do not correlate
  RETURN QUERY SELECT FALSE, 'No correlation rule for ' || p_signal_type || ' to ' || p_incident_status::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- INDEXES FOR EFFICIENT CORRELATION LOOKUPS
-- ============================================================================

-- Find most recent active incident for an organization within correlation window
CREATE INDEX idx_incidents_org_status_created ON incidents(
  organization_id, status, created_at DESC
) WHERE status NOT IN ('RESOLVED', 'FALSE_ALARM');

-- Find correlations for a signal
CREATE INDEX idx_correlations_org_signal_time ON signal_incident_correlations(
  organization_id, signal_event_id, correlated_at DESC
);

-- ============================================================================
-- AUDIT TRAIL ENHANCEMENT
-- ============================================================================

-- Track when signals are associated with incidents
-- This becomes part of the incident audit trail (via incident_events)
-- No modification to incident_events table needed; correlation is tracked in
-- signal_incident_correlations table

-- ============================================================================
-- DATA MIGRATION & COMPATIBILITY
-- ============================================================================

-- Existing M3 signals without correlation:
-- These remain in signal_events and signal_detections
-- Their incident_id (if set) is the 1:1 relationship from detection
-- New signals will use signal_incident_correlations for many:1 relationships

-- ============================================================================
-- CONCURRENCY PROTECTION
-- ============================================================================

-- Application must use SELECT...FOR UPDATE on incidents before checking correlation
-- to prevent race conditions where two SOS requests create duplicate incidents

-- Example pattern (application code):
-- BEGIN TRANSACTION
--   SELECT id, status FROM incidents WHERE id = X FOR UPDATE
--   IF can correlate:
--     INSERT signal_incident_correlations
--   ELSE:
--     INSERT NEW incident via M2 RPC
-- COMMIT

-- The FOR UPDATE lock ensures only one request proceeds with new incident creation
