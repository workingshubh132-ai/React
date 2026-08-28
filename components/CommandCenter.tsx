'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { subscribeToActiveIncidents, subscribeToResponderStatus, cleanupAllSubscriptions } from '@/lib/realtime'
import LogoutButton from '@/components/LogoutButton'
import IncidentCard from '@/components/IncidentCard'
import type { Incident } from '@/types/database'

interface CommandCenterProps {
  organizationId: string
  organizationName: string
}

export default function CommandCenter({ organizationId, organizationName }: CommandCenterProps) {
  const supabase = createClient()

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [connectionState, setConnectionState] = useState<'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('CONNECTED')
  const [activeCount, setActiveCount] = useState(0)
  const [criticalCount, setCriticalCount] = useState(0)
  const [availableResponders, setAvailableResponders] = useState(0)
  const [respondingCount, setRespondingCount] = useState(0)

  // Fetch active incidents
  const fetchIncidents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('organization_id', organizationId)
        .not('status', 'in', '(RESOLVED,FALSE_ALARM)')
        .order('detected_at', { ascending: false })

      if (!error && data) {
        setIncidents(data as Incident[])
        setActiveCount(data.length)
        setCriticalCount(data.filter((i) => i.severity === 'CRITICAL').length)
      }
    } catch (err) {
      console.error('Failed to fetch incidents:', err)
    }
  }, [organizationId, supabase])

  // Fetch responder statistics
  const fetchResponderStats = useCallback(async () => {
    try {
      const { data: responders, error } = await supabase
        .from('responders')
        .select('availability')
        .eq('organization_id', organizationId)

      if (!error && responders) {
        const available = responders.filter((r) => r.availability === 'AVAILABLE').length
        const responding = responders.filter((r) => r.availability === 'RESPONDING').length
        setAvailableResponders(available)
        setRespondingCount(responding)
      }
    } catch (err) {
      console.error('Failed to fetch responder stats:', err)
    }
  }, [organizationId, supabase])

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchIncidents(), fetchResponderStats()])
      setLoading(false)
    }

    load()
  }, [fetchIncidents, fetchResponderStats])

  // Setup real-time subscriptions
  useEffect(() => {
    const unsubscribeIncidents = subscribeToActiveIncidents(
      supabase,
      organizationId,
      async () => {
        // Refetch on change
        await fetchIncidents()
      },
      (error) => {
        console.error('Incident subscription error:', error)
        setConnectionState('DISCONNECTED')
      }
    )

    const unsubscribeResponders = subscribeToResponderStatus(
      supabase,
      organizationId,
      async () => {
        // Refetch on change
        await fetchResponderStats()
      },
      (error) => {
        console.error('Responder subscription error:', error)
        setConnectionState('DISCONNECTED')
      }
    )

    // Assume connected after subscriptions
    setConnectionState('CONNECTED')

    return () => {
      unsubscribeIncidents()
      unsubscribeResponders()
      cleanupAllSubscriptions()
    }
  }, [organizationId, fetchIncidents, fetchResponderStats, supabase])

  const getConnectionDisplay = () => {
    switch (connectionState) {
      case 'CONNECTED':
        return { icon: '🟢', text: 'LIVE', color: 'text-green-400' }
      case 'RECONNECTING':
        return { icon: '🟡', text: 'RECONNECTING', color: 'text-yellow-400' }
      case 'DISCONNECTED':
        return { icon: '🔴', text: 'OFFLINE', color: 'text-red-400' }
    }
  }

  const connection = getConnectionDisplay()

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">RE:ACT COMMAND</h1>
              <p className="text-sm text-slate-400">{organizationName}</p>
            </div>
            <div className="flex items-center gap-6">
              <div className={`flex items-center gap-2 ${connection.color}`}>
                <span className="text-xl">{connection.icon}</span>
                <span className="text-sm font-semibold">{connection.text}</span>
              </div>
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Status grid */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <p className="text-sm text-slate-400">ACTIVE INCIDENTS</p>
            <p className="text-3xl font-bold text-white">{activeCount}</p>
          </div>
          <div className="rounded-lg border border-red-700 bg-red-900 bg-opacity-20 p-4">
            <p className="text-sm text-red-400">CRITICAL</p>
            <p className="text-3xl font-bold text-red-400">{criticalCount}</p>
          </div>
          <div className="rounded-lg border border-green-700 bg-green-900 bg-opacity-20 p-4">
            <p className="text-sm text-green-400">AVAILABLE</p>
            <p className="text-3xl font-bold text-green-400">{availableResponders}</p>
          </div>
          <div className="rounded-lg border border-blue-700 bg-blue-900 bg-opacity-20 p-4">
            <p className="text-sm text-blue-400">RESPONDING</p>
            <p className="text-3xl font-bold text-blue-400">{respondingCount}</p>
          </div>
        </div>

        {/* Incidents section */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="mb-6 text-xl font-semibold text-white">ACTIVE INCIDENTS</h2>

          {loading ? (
            <p className="text-slate-400">Loading incidents...</p>
          ) : incidents.length === 0 ? (
            <p className="text-slate-400">No active incidents</p>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
