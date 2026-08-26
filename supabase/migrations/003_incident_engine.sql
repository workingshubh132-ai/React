-- RE:ACT M2 — Incident Engine Migration
-- Adds incident management system with state machine and event tracking

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
-- Users can view incidents in their organization
CREATE POLICY "users_view_organization_incidents" ON incidents
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can create incidents in their organization
CREATE POLICY "users_create_incidents" ON incidents
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only ADMIN/SUPERVISOR can update incidents
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
-- Users can view events for incidents in their organization
CREATE POLICY "users_view_organization_incident_events" ON incident_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only ADMIN/SUPERVISOR can insert events
CREATE POLICY "users_create_incident_events" ON incident_events
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- Prevent deletion/update of events (immutable log)
CREATE POLICY "prevent_event_modification" ON incident_events
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "prevent_event_deletion" ON incident_events
  FOR DELETE USING (false);

-- INCIDENT RESPONDERS TABLE POLICIES
-- Users can view incident responder assignments in their organization
CREATE POLICY "users_view_organization_incident_responders" ON incident_responders
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can create incident responder assignments (via API/service only)
CREATE POLICY "users_manage_incident_responders" ON incident_responders
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- Users can update incident responder status (accept/decline/arrive)
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
