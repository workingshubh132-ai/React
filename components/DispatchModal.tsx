'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DispatchModalProps {
  incidentId: string
  organizationId: string
  onClose: () => void
  onSuccess: () => void
}

interface Responder {
  id: string
  availability: string
  last_status_update: string
  profiles?: {
    full_name: string
  }
}

export default function DispatchModal({ incidentId, organizationId, onClose, onSuccess }: DispatchModalProps) {
  const supabase = createClient()

  const [responders, setResponders] = useState<Responder[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [dispatching, setDispatching] = useState(false)
  const [error, setError] = useState('')

  // Fetch available responders
  useEffect(() => {
    const fetchResponders = async () => {
      try {
        const response = await fetch('/api/responders/available')
        if (response.ok) {
          const data = await response.json()
          setResponders(data.responders || [])
        }
      } catch (err) {
        console.error('Failed to fetch responders:', err)
        setError('Failed to load responders')
      } finally {
        setLoading(false)
      }
    }

    fetchResponders()
  }, [])

  // Handle dispatch
  const handleDispatch = async () => {
    if (selectedIds.length === 0) {
      setError('Select at least one responder')
      return
    }

    setDispatching(true)
    setError('')

    try {
      const response = await fetch(`/api/incidents/${incidentId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responder_ids: selectedIds }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Dispatch failed')
        return
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispatch failed')
    } finally {
      setDispatching(false)
    }
  }

  const toggleResponder = (responderId: string) => {
    setSelectedIds((prev) => (prev.includes(responderId) ? prev.filter((id) => id !== responderId) : [...prev, responderId]))
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Dispatch Responders</h2>

        {error && <div className="mb-4 rounded bg-red-900 p-3 text-sm text-red-400">{error}</div>}

        {loading ? (
          <p className="text-slate-400">Loading responders...</p>
        ) : responders.length === 0 ? (
          <p className="text-slate-400">No available responders</p>
        ) : (
          <div className="mb-4 max-h-64 space-y-2 overflow-y-auto">
            {responders.map((responder) => (
              <label key={responder.id} className="flex items-center gap-3 rounded border border-slate-700 bg-slate-700 p-3 cursor-pointer hover:bg-slate-600">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(responder.id)}
                  onChange={() => toggleResponder(responder.id)}
                  className="h-4 w-4 rounded border-slate-500 bg-slate-600"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{responder.profiles?.full_name || 'Unknown'}</p>
                  <p className="text-xs text-slate-400">{responder.availability}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleDispatch}
            disabled={dispatching || selectedIds.length === 0}
            className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-600 disabled:text-slate-400"
          >
            {dispatching ? 'Dispatching...' : 'Dispatch'}
          </button>
        </div>
      </div>
    </div>
  )
}
