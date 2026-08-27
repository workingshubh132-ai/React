-- RE:ACT M3 — Signal Events & Detection Engine
-- Deterministic signal ingestion, validation, and detection rule application

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

-- RLS Policy: Users can only read signals from their own organization
CREATE POLICY "users_read_own_org_signals" ON signal_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policy: Only authenticated users can insert signals (app-level authorization)
CREATE POLICY "authenticated_insert_signals" ON signal_events
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policy: Signal events are immutable (prevent UPDATE/DELETE)
-- Users cannot modify signal history
CREATE POLICY "prevent_update_signals" ON signal_events
  FOR UPDATE
  USING (FALSE);

CREATE POLICY "prevent_delete_signals" ON signal_events
  FOR DELETE
  USING (FALSE);

-- ============================================================================
-- Detection Decision Cache (Optional - for tracking detection results)
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

-- ============================================================================
-- Security: Prevent Direct Access to Signal State Without Proper Flow
-- ============================================================================

-- Signal events are write-once, read-restricted
-- The detection engine controls when signals are converted to incidents
-- Users cannot bypass the detection decision system
