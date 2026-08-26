'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded-lg bg-slate-700 px-4 py-2 font-medium text-white transition hover:bg-slate-600"
    >
      Sign Out
    </button>
  )
}
