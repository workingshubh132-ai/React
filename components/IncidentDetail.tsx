'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { subscribeToIncidentAssignments, subscribeToActiveIncidents } from '@/lib/realtime'
import DispatchModal from '@/components/DispatchModal'
import type { Incident } from '@/types/database'

interface IncidentDetailProps {
  incident: Incident
  userId: string
  organizationId: string
  userRole: string
}

interface IncidentEvent {
  id: string
  event_type: string
  created_at: string
  actor_id?: string
  metadata?: any
}

interface Assignment {
  id: string
  responder_id: string
  status: string
  assigned_at: string
  accepted_at?: string
  arrived_at?: string
  responders?: {
    profiles?: {
      full_name: string
    }
  }
}

export default function IncidentDetail({ incident: initialIncident, userId, organizationId, userRole }: IncidentDetailProps) {
  const supabase = createClient()

  const [incident, setIncident] = useState(initialIncident)
  const [events, setEvents] = useState<IncidentEvent[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<any>(null)

  // Fetch incident details
  const fetchIncidentDetail = async () => {
    try {
      const response = await fetch(`/api/incidents/${incident.id}`)
      if (response.ok) {
        const data = await response.json()
        setIncident(data.incident)
        setEvents(data.events || [])
        setAssignments(data.assignments || [])
        setMetrics(data.metrics)
      }
    } catch (err) {
      console.error('Failed to fetch incident details:', err)
    }
  }

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await fetchIncidentDetail()
      setLoading(false)
    }

    load()
  }, [])

  // Subscribe to assignment changes
  useEffect(() => {
    const unsubscribe = subscribeToIncidentAssignments(
      supabase,
      incident.id,
      async () => {
        await fetchIncidentDetail()
      },
      (error) => {
        console.error('Assignment subscription error:', error)
      }
    )

    return () => unsubscribe()
  }, [incident.id])

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

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'DETECTED':
        return 'Detected'
      case 'VERIFYING':
        return 'Verifying'
      case 'VERIFIED':
        return 'Verified'
      case 'DISPATCHED':
        return 'Dispatched'
      case 'RESPONDING':
        return 'Responding'
      case 'RESOLVED':
        return 'Resolved'
      case 'FALSE_ALARM':
        return 'False Alarm'
      default:
        return status
    }
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString()
  }

  const formatEventType = (eventType: string) => {
    const types: Record<string, string> = {
      INCIDENT_CREATED: 'Incident created',
      INCIDENT_VERIFICATION_STARTED: 'Verification started',
      INCIDENT_VERIFIED: 'Verified',
      INCIDENT_MARKED_FALSE_ALARM: 'Marked false alarm',
      INCIDENT_DISPATCHED: 'Responders dispatched',
      RESPONDER_ACCEPTED: 'Responder accepted',
      RESPONDER_ARRIVED: 'Responder arrived',
      INCIDENT_RESOLVED: 'Incident resolved',
    }
    return types[eventType] || eventType
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-slate-400">Loading incident details...</p>
      </div>
    )
  }

  const canDispatch = ['ADMIN', 'SUPERVISOR'].includes(userRole) && incident.status === 'VERIFIED'
  const elapsedSeconds = Math.floor((Date.now() - new Date(incident.detected_at).getTime()) / 1000)
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60

  return (
    <div>
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900 px-6 py-6">
        <div className="mx-auto max-w-4xl">
          <Link href="/command" className="mb-4 text-sm text-blue-400 hover:text-blue-300">
            ← Back to Command Center
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{getSeverityIcon(incident.severity)}</span>
                <h1 className="text-2xl font-bold text-white">{incident.title}</h1>
              </div>
              <p className="mt-2 text-sm text-slate-400">{incident.description}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Status</p>
              <p className="text-lg font-semibold text-white">{getStatusDisplay(incident.status)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Info grid */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs text-slate-400">TYPE</p>
            <p className="text-sm font-semibold text-white">{incident.incident_type}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs text-slate-400">SEVERITY</p>
            <p className="text-sm font-semibold text-white">{incident.severity}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs text-slate-400">ELAPSED</p>
            <p className="text-sm font-semibold text-white">
              {minutes}m {seconds}s
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs text-slate-400">LOCATION</p>
            <p className="text-sm font-semibold text-white">
              {incident.latitude && incident.longitude
                ? `${incident.latitude.toFixed(4)}, ${incident.longitude.toFixed(4)}`
                : 'Unknown'}
            </p>
          </div>
        </div>

        {/* Responder assignments section */}
        <div className="mb-8 rounded-lg border border-slate-700 bg-slate-800 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">RESPONDERS</h2>
            {canDispatch && (
              <button
                onClick={() => setShowDispatchModal(true)}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                + Dispatch
              </button>
            )}
          </div>

          {assignments.length === 0 ? (
            <p className="text-slate-400">No responders assigned</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="rounded border border-slate-700 bg-slate-700 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        {assignment.responders?.profiles?.full_name || 'Unknown Responder'}
                      </p>
                      <p className="text-xs text-slate-400">
                        Assigned: {formatTime(assignment.assigned_at)}
                        {assignment.accepted_at && ` • Accepted: ${formatTime(assignment.accepted_at)}`}
                        {assignment.arrived_at && ` • Arrived: ${formatTime(assignment.arrived_at)}`}
                      </p>
                    </div>
                    <span className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white">{assignment.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline section */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          <h2 className="mb-6 text-lg font-semibold text-white">INCIDENT TIMELINE</h2>

          {events.length === 0 ? (
            <p className="text-slate-400">No events recorded</p>
          ) : (
            <div className="space-y-4">
              {events.map((event, idx) => (
                <div key={event.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                    {idx < events.length - 1 && <div className="h-12 w-0.5 bg-slate-700"></div>}
                  </div>
                  <div className="pb-4">
                    <p className="font-mono text-xs text-slate-500">{formatTime(event.created_at)}</p>
                    <p className="text-sm font-semibold text-white">{formatEventType(event.event_type)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dispatch modal */}
      {showDispatchModal && (
        <DispatchModal
          incidentId={incident.id}
          organizationId={organizationId}
          onClose={() => setShowDispatchModal(false)}
          onSuccess={async () => {
            setShowDispatchModal(false)
            await fetchIncidentDetail()
          }}
        />
      )}
    </div>
  )
}
