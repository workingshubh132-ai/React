'use client'

import Link from 'next/link'
import type { Incident } from '@/types/database'

interface IncidentCardProps {
  incident: Incident
}

export default function IncidentCard({ incident }: IncidentCardProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-900 border-red-700 text-red-400'
      case 'HIGH':
        return 'bg-orange-900 border-orange-700 text-orange-400'
      case 'MEDIUM':
        return 'bg-yellow-900 border-yellow-700 text-yellow-400'
      case 'LOW':
        return 'bg-blue-900 border-blue-700 text-blue-400'
      default:
        return 'bg-slate-700 border-slate-600 text-slate-300'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DETECTED':
        return 'text-gray-400'
      case 'VERIFYING':
        return 'text-yellow-400'
      case 'VERIFIED':
        return 'text-orange-400'
      case 'DISPATCHED':
        return 'text-blue-400'
      case 'RESPONDING':
        return 'text-purple-400'
      case 'RESOLVED':
        return 'text-green-400'
      case 'FALSE_ALARM':
        return 'text-slate-400'
      default:
        return 'text-gray-400'
    }
  }

  const elapsedSeconds = Math.floor((Date.now() - new Date(incident.detected_at).getTime()) / 1000)
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  const elapsedTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

  return (
    <Link href={`/command/incidents/${incident.id}`}>
      <div className="block cursor-pointer rounded-lg border border-slate-700 bg-slate-700 px-4 py-3 transition hover:border-slate-600 hover:bg-slate-600">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className={`inline-block rounded border px-2 py-1 text-xs font-medium ${getSeverityColor(incident.severity)}`}>
                {incident.severity}
              </span>
              <h3 className="font-semibold text-white">{incident.title}</h3>
              <span className={`text-xs font-semibold ${getStatusColor(incident.status)}`}>{incident.status}</span>
            </div>
            <div className="mt-2 text-sm text-slate-400">
              Type: {incident.incident_type} • Detected: {new Date(incident.detected_at).toLocaleTimeString()} • Elapsed: {elapsedTime}
            </div>
            {incident.latitude && incident.longitude && (
              <div className="mt-1 text-xs text-slate-400">
                📍 {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
              </div>
            )}
          </div>
          <div className="ml-4 flex flex-col items-end gap-2">
            <span className="text-xs font-mono text-slate-500">{incident.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
