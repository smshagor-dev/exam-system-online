'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  assignmentId: string
  allowedActions: string[]
}

export default function TeachingAssignmentActionButtons({ assignmentId, allowedActions }: Props) {
  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (allowedActions.length === 0) {
    return <p className="text-xs text-gray-400">No additional workflow actions available.</p>
  }

  async function runAction(action: string) {
    setLoadingAction(action)
    setError(null)

    try {
      const response = await fetch(`/api/admin/teaching-assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes: `Admin UI action: ${action}`,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || `Failed to ${action} assignment`)
      }
      router.refresh()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Failed to ${action} assignment`)
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allowedActions.map((action) => (
          <button key={action} type="button" onClick={() => runAction(action)} disabled={loadingAction !== null} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            {loadingAction === action ? 'Working...' : action.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
