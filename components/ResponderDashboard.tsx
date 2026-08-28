'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { subscribeToResponderAssignments } from '@/lib/realtime'
import LogoutButton from '@/components/LogoutButton'
import type { Incident } from '@/types/database'

interface ResponderDashboardProps {
  responderId: string
  userId: string
  organizationId: string
}

interface Assignment {
  id: string
  incident_id: string
  status: string
  assigned_at: string
  accepted_at?: string
  arrived_at?: string
  incident?: Incident & { responders?: any }
}

export default function ResponderDashboard({ responderId, userId, organizationId }: ResponderDashboardProps) {
  const supabase = createClient()

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [actingAssignmentId, setActingAssignmentId] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState(false)

  // Fetch assigned incidents
  const fetchAssignments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('incident_responders')
        .select(
          `
          id,
          incident_id,
          status,
          assigned_at,
          accepted_at,
          arrived_at,
          incidents!inner(*)
        `
        )
        .eq('responder_id', responderId)
        .not('status', 'in', '(COMPLETED)')
        .order('assigned_at', { ascending: false })

      if (!error && data) {
        setAssignments(
          data.map((item: any) => ({
            id: item.id,
            incident_id: item.incident_id,
            status: item.status,
            assigned_at: item.assigned_at,
            accepted_at: item.accepted_at,
            arrived_at: item.arrived_at,
            incident: item.incidents,
          }))
        )
      }
    } catch (err) {
      console.error('Failed to fetch assignments:', err)
    }
  }, [responderId, supabase])

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await fetchAssignments()
      setLoading(false)
    }

    load()
  }, [fetchAssignments])

  // Subscribe to assignment changes
  useEffect(() => {
    const unsubscribe = subscribeToResponderAssignments(
      supabase,
      responderId,
      async () => {
        await fetchAssignments()
      },
      (error) => {
        console.error('Assignment subscription error:', error)
      }
    )

    return () => unsubscribe()
  }, [responderId, fetchAssignments, supabase])

  // Handle assignment action (acknowledge, respond, arrive, complete)
  const handleAssignmentAction = async (assignmentId: string, action: string) => {
    setActingAssignmentId(assignmentId)
    setActionInProgress(true)

    try {
      const assignment = assignments.find((a) => a.id === assignmentId)
      if (!assignment) return

      const response = await fetch(`/api/incident-responders/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Action failed')
        return
      }

      await fetchAssignments()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActingAssignmentId(null)
      setActionInProgress(false)
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return '🚨'
      case 'HIGH':
        return '⚠️'
      case 'MEDIUM':
        return '⚡'
      case 'LOW':
        return 'ℹ️'
      default:
        return '❓'
    }
  }

  const getNextAction = (status: string) => {
    switch (status) {
      case 'ASSIGNED':
        return { label: 'ACKNOWLEDGE', action: 'accept' }
      case 'ACCEPTED':
        return { label: 'RESPOND', action: 'respond' }
      case 'RESPONDING':
        return { label: 'ARRIVED', action: 'arrive' }
      case 'ARRIVED':
        return { label: 'COMPLETE', action: 'complete' }
      default:
        return null
    }
  }

  const activeAssignments = assignments.filter((a) => a.status !== 'COMPLETED')

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">RE:ACT RESPONDER</h1>
            <p className="text-xs text-slate-400 sm:text-sm">Emergency Assignment Portal</p>
          </div>
          <LogoutButton />
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {loading ? (
          <p className="text-center text-slate-400">Loading assignments...</p>
        ) : activeAssignments.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 text-center">
            <p className="text-slate-400">No active assignments</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeAssignments.map((assignment) => {
              const incident = assignment.incident
              const nextAction = getNextAction(assignment.status)
              const isActing = actingAssignmentId === assignment.id && actionInProgress

              if (!incident) return null

              return (
                <div key={assignment.id} className="rounded-lg border border-slate-700 bg-slate-800 p-4 sm:p-6">
                  {/* Incident header */}
                  <div className="mb-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl sm:text-3xl">{getSeverityIcon(incident.severity)}</span>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl sm:text-2xl font-bold text-white break-words">{incident.title}</h2>
                        <p className="text-xs sm:text-sm text-slate-400 mt-1">
                          {incident.incident_type} • {incident.severity} • Detected{' '}
                          {Math.floor((Date.now() - new Date(incident.detected_at).getTime()) / 1000)}s ago
                        </p>
                        {incident.latitude && incident.longitude && (
                          <p className="text-xs sm:text-sm text-slate-400 mt-1">
                            📍 {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Assignment status */}
                  <div className="mb-6 rounded bg-slate-700 p-3">
                    <p className="text-xs text-slate-400">Assignment Status</p>
                    <p className="text-lg font-semibold text-white">{assignment.status}</p>
                    {assignment.accepted_at && (
                      <p className="text-xs text-slate-400 mt-1">Acknowledged at {new Date(assignment.accepted_at).toLocaleTimeString()}</p>
                    )}
                  </div>

                  {/* Action button */}
                  {nextAction && (
                    <button
                      onClick={() => handleAssignmentAction(assignment.id, nextAction.action)}
                      disabled={isActing}
                      className="w-full rounded bg-blue-600 py-3 text-lg font-bold text-white hover:bg-blue-700 disabled:bg-slate-600 sm:text-xl"
                    >
                      {isActing ? 'Processing...' : nextAction.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
