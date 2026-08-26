import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'
import type { Incident } from '@/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organizations(name)')
    .eq('id', user.id)
    .single()

  const organizationName = profile?.organizations?.name || 'Organization'

  // Fetch incidents for the organization
  const { data: incidents } = await supabase
    .from('incidents')
    .select('*')
    .eq('organization_id', profile?.organization_id)
    .order('detected_at', { ascending: false })
    .limit(10)

  const activeIncidents = (incidents || []).filter((i: Incident) => !['RESOLVED', 'FALSE_ALARM'].includes(i.status))

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-600'
      case 'HIGH':
        return 'bg-orange-600'
      case 'MEDIUM':
        return 'bg-yellow-600'
      case 'LOW':
        return 'bg-blue-600'
      default:
        return 'bg-gray-600'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DETECTED':
        return 'bg-gray-600'
      case 'VERIFYING':
        return 'bg-yellow-600'
      case 'VERIFIED':
        return 'bg-orange-600'
      case 'DISPATCHED':
        return 'bg-blue-600'
      case 'RESPONDING':
        return 'bg-purple-600'
      case 'RESOLVED':
        return 'bg-green-600'
      case 'FALSE_ALARM':
        return 'bg-slate-600'
      default:
        return 'bg-gray-600'
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white">RE:ACT</h1>
            <p className="text-slate-400">Emergency Intelligence Platform</p>
          </div>
          <LogoutButton />
        </div>

        {/* User Information Card */}
        <div className="mb-8 rounded-lg bg-slate-800 p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-semibold text-white">User Profile</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-400">Name</p>
              <p className="text-lg font-medium text-white">
                {profile?.full_name || 'User'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Email</p>
              <p className="text-lg font-medium text-white">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Role</p>
              <p className="text-lg font-medium text-white">
                {profile?.role || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Organization Card */}
        <div className="mb-8 rounded-lg bg-slate-800 p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-semibold text-white">Organization</h2>
          <p className="text-lg font-medium text-white">{organizationName}</p>
        </div>

        {/* System Status Card */}
        <div className="mb-8 rounded-lg bg-slate-800 p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-semibold text-white">System Status</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <div>
                <p className="text-sm text-slate-400">Backend</p>
                <p className="font-medium text-white">Operational</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <div>
                <p className="text-sm text-slate-400">Database</p>
                <p className="font-medium text-white">Connected</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <div>
                <p className="text-sm text-slate-400">Authentication</p>
                <p className="font-medium text-white">Operational</p>
              </div>
            </div>
          </div>
        </div>

        {/* Incidents Card */}
        <div className="rounded-lg bg-slate-800 p-6 shadow-lg">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Incidents</h2>
            <span className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
              <p className="text-sm text-slate-300">{activeIncidents.length} Active</p>
            </span>
          </div>

          {incidents && incidents.length > 0 ? (
            <div className="space-y-3">
              {incidents.map((incident: Incident) => (
                <div key={incident.id} className="flex items-center justify-between rounded-lg bg-slate-700 p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`inline-block rounded px-2 py-1 text-xs font-medium text-white ${getSeverityColor(incident.severity)}`}>
                        {incident.severity}
                      </span>
                      <h3 className="font-medium text-white">{incident.title}</h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Type: {incident.incident_type} • Detected: {new Date(incident.detected_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <span className={`inline-block rounded px-2 py-1 text-xs font-medium text-white ${getStatusColor(incident.status)}`}>
                      {incident.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">No incidents recorded</p>
          )}
        </div>
      </div>
    </main>
  )
}
