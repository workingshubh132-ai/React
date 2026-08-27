import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import IncidentDetail from '@/components/IncidentDetail'

interface IncidentPageProps {
  params: Promise<{ id: string }>
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const supabase = await createClient()
  const { id } = await params

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

  // Fetch incident
  const { data: incident } = await supabase
    .from('incidents')
    .select('*')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!incident) {
    redirect('/command')
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <IncidentDetail incident={incident} userId={user.id} organizationId={profile.organization_id} userRole={profile.role} />
    </div>
  )
}
