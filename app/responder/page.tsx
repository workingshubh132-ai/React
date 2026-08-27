import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ResponderDashboard from '@/components/ResponderDashboard'

export default async function ResponderPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  // Only RESPONDER role can access this
  if (profile.role !== 'RESPONDER') {
    redirect('/dashboard')
  }

  // Get responder record
  const { data: responder } = await supabase
    .from('responders')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!responder) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <ResponderDashboard responderId={responder.id} userId={user.id} organizationId={profile.organization_id} />
    </div>
  )
}
