import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

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
        <div className="rounded-lg bg-slate-800 p-6 shadow-lg">
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
      </div>
    </main>
  )
}
