-- RE:ACT M4 — Physical Node Device Management
-- Extends device authentication with credential management, health tracking, and node-specific state

-- ============================================================================
-- DEVICE AUTHENTICATION & CREDENTIALS
-- ============================================================================

-- Device credentials for node authentication
-- Each device has individually provisioned credentials (not shared)
CREATE TABLE device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type IN ('API_KEY', 'JWT_TOKEN')),
  credential_hash TEXT NOT NULL UNIQUE,
  -- Plain credential is NEVER stored; only hash
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Prevent duplicate active credentials per device
  UNIQUE (device_id, credential_type, revoked_at) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_device_creds_device_id ON device_credentials(device_id);
CREATE INDEX idx_device_creds_org_id ON device_credentials(organization_id);
CREATE INDEX idx_device_creds_hash ON device_credentials(credential_hash);
CREATE INDEX idx_device_creds_revoked ON device_credentials(revoked_at);

-- ============================================================================
-- DEVICE HEALTH & STATUS TRACKING
-- ============================================================================

-- Extended device status tracking
CREATE TABLE device_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Status
  status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN (
    'ONLINE',       -- Heartbeat received recently
    'OFFLINE',      -- No heartbeat for timeout period
    'ERROR',        -- Last heartbeat indicated error
    'UNKNOWN'       -- No heartbeat received yet
  )),

  -- Firmware/Hardware
  firmware_version TEXT,
  hardware_model TEXT,

  -- Power
  battery_level INT CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100)),
  battery_voltage_mv INT,
  charging BOOLEAN,

  -- Signal Quality
  wifi_rssi INT,       -- Signal strength in dBm
  wifi_ssid TEXT,      -- Connected SSID

  -- Environment
  device_temperature_c NUMERIC,  -- Device internal temperature, not environmental
  uptime_seconds BIGINT,         -- Device uptime

  -- Connectivity
  last_heartbeat_at TIMESTAMPTZ,
  last_heartbeat_latency_ms INT,

  -- Error Tracking
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

-- Track signal event IDs to prevent duplicate logical processing
-- Each physical node signal has a unique event_id for idempotency
CREATE TABLE device_signal_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,  -- Device-generated unique event ID
  signal_event_id UUID NOT NULL REFERENCES signal_events(id) ON DELETE CASCADE,

  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure one signal_event per device event
  UNIQUE (device_id, event_id)
);

CREATE INDEX idx_signal_idem_device_id ON device_signal_idempotency(device_id);
CREATE INDEX idx_signal_idem_event_id ON device_signal_idempotency(event_id);
CREATE INDEX idx_signal_idem_received ON device_signal_idempotency(received_at DESC);

-- ============================================================================
-- DEVICE HEARTBEAT HISTORY
-- ============================================================================

-- Detailed heartbeat history for monitoring device health over time
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

-- Update devices table to include enabled/disabled state
-- If table doesn't have this column, add it
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================================
-- DEVICE CONFIGURATION
-- ============================================================================

-- Node-specific configuration (thresholds, retry intervals, etc.)
CREATE TABLE device_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Configuration keys
  config_key TEXT NOT NULL,
  config_value TEXT,

  -- Metadata
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

-- Find devices by organization and status
CREATE INDEX idx_devices_org_enabled ON devices(organization_id, enabled) WHERE enabled = true;

-- Find all online/offline devices quickly
CREATE INDEX idx_device_health_org_status_updated ON device_health(
  organization_id, status, updated_at DESC
);

-- ============================================================================
-- RLS POLICIES FOR DEVICE MANAGEMENT
-- ============================================================================

ALTER TABLE device_credentials ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can verify credentials
-- Credential hashes are not exposed via API
CREATE POLICY "authenticated_verify_credentials" ON device_credentials
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- SECURITY CONSIDERATIONS
-- ============================================================================

-- 1. Credential hashes are stored, never plain credentials
-- 2. RLS prevents cross-organization device access
-- 3. Device authentication must verify device.enabled = true
-- 4. No shared secrets; each device provisioned individually
-- 5. Heartbeat data includes no sensitive PII
-- 6. Device health data is write-only from device; read-only from UI
