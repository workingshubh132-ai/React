import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CommandCenter from '@/components/CommandCenter'

export default async function CommandPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user's profile and organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organizations(name)')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  // Only ADMIN/SUPERVISOR can access command center
  if (!['ADMIN', 'SUPERVISOR'].includes(profile.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <CommandCenter organizationId={profile.organization_id} organizationName={profile.organizations?.name || 'Organization'} />
    </div>
  )
}
