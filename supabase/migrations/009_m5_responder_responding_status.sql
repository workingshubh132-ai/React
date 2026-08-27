-- RE:ACT M5 — Add RESPONDING status to incident responders
-- Enables responder state machine: ASSIGNED → ACCEPTED → RESPONDING → ARRIVED → COMPLETED

-- ============================================================================
-- INCIDENT RESPONDERS STATUS UPDATE
-- ============================================================================

-- Drop existing constraint and recreate with RESPONDING status
ALTER TABLE incident_responders
  DROP CONSTRAINT incident_responders_status_check;

ALTER TABLE incident_responders
  ADD CONSTRAINT incident_responders_status_check
  CHECK (status IN ('ASSIGNED', 'ACCEPTED', 'DECLINED', 'RESPONDING', 'ARRIVED', 'COMPLETED'));

-- Add responded_at timestamp for tracking when responder started responding
ALTER TABLE incident_responders ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Create index for response status queries
CREATE INDEX IF NOT EXISTS idx_incident_responders_status_responded_at
ON incident_responders(status, responded_at DESC)
WHERE status = 'RESPONDING';
