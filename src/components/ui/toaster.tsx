'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type Toast = {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

type ToastContextValue = {
  toast: (message: string, type?: Toast['type']) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => removeToast(id), 4000)
  }, [removeToast])

  const colorMap: Record<Toast['type'], string> = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
    warning: 'bg-orange-500',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-in slide-in-from-bottom-2 flex max-w-xs items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${colorMap[t.type]}`}
          >
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="ml-1 text-white/70 hover:text-white"
              aria-label="Dismiss notification"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
