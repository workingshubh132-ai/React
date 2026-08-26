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
-- Users can view their own organization
CREATE POLICY "users_view_own_organization" ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for profiles
-- Users can view profiles in their organization
CREATE POLICY "users_view_organization_profiles" ON profiles
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update their own profile
CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- RLS Policies for devices
-- Users can view devices in their organization
CREATE POLICY "users_view_organization_devices" ON devices
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can insert devices if they are ADMIN or SUPERVISOR in their organization
CREATE POLICY "users_create_organization_devices" ON devices
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- Users can update devices if they are ADMIN or SUPERVISOR in their organization
CREATE POLICY "users_update_organization_devices" ON devices
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- RLS Policies for responders
-- Users can view responders in their organization
CREATE POLICY "users_view_organization_responders" ON responders
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update responder data if they are ADMIN or SUPERVISOR
CREATE POLICY "users_update_organization_responders" ON responders
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- Grant public access to necessary functions (no permissions needed for anon key)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
