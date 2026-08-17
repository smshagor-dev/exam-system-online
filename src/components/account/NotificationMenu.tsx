'use client'

import { Bell, CheckCheck, Loader2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type NotificationItem = {
  id: string
  title: string
  message: string
  type: string
  link: string | null
  isRead: boolean
  createdAt: string
}

type NotificationPayload = {
  notifications: NotificationItem[]
  unreadCount: number
}

type NotificationMenuProps = {
  accent?: 'blue' | 'sky' | 'violet'
}

const ACCENTS = {
  blue: {
    button: 'hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-500',
    badge: 'bg-blue-600',
    unread: 'bg-blue-50/70',
    dot: 'bg-blue-600',
    action: 'text-blue-700 hover:bg-blue-50',
  },
  sky: {
    button: 'hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:ring-sky-500',
    badge: 'bg-sky-600',
    unread: 'bg-sky-50/70',
    dot: 'bg-sky-600',
    action: 'text-sky-700 hover:bg-sky-50',
  },
  violet: {
    button: 'hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-violet-500',
    badge: 'bg-violet-600',
    unread: 'bg-violet-50/70',
    dot: 'bg-violet-600',
    action: 'text-violet-700 hover:bg-violet-50',
  },
} as const

function formatRelativeTime(value: string) {
  const createdAt = new Date(value).getTime()
  if (!Number.isFinite(createdAt)) return ''

  const diff = Math.max(0, Date.now() - createdAt)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return 'Just now'
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(new Date(value))
}

export default function NotificationMenu({ accent = 'blue' }: NotificationMenuProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const styles = ACCENTS[accent]

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/account/notifications', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(response.status === 401 ? 'Sign in to view notifications.' : 'Unable to load notifications.')
      }

      const payload = (await response.json()) as NotificationPayload
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : [])
      setUnreadCount(Number.isFinite(payload.unreadCount) ? payload.unreadCount : 0)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNotifications()
    const timer = window.setInterval(() => void loadNotifications(), 60_000)
    return () => window.clearInterval(timer)
  }, [loadNotifications])

  useEffect(() => {
    if (open) void loadNotifications()
  }, [open, loadNotifications])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const markRead = async (id: string) => {
    const target = notifications.find((item) => item.id === id)
    if (!target || target.isRead) return

    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, isRead: true } : item)))
    setUnreadCount((current) => Math.max(0, current - 1))

    try {
      const response = await fetch('/api/account/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error('Unable to mark notification as read.')
    } catch {
      void loadNotifications()
    }
  }

  const markAllRead = async () => {
    if (unreadCount === 0) return

    const previous = notifications
    const previousUnreadCount = unreadCount
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
    setUnreadCount(0)

    try {
      const response = await fetch('/api/account/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
      if (!response.ok) throw new Error('Unable to mark notifications as read.')
    } catch {
      setNotifications(previous)
      setUnreadCount(previousUnreadCount)
    }
  }

  const openNotification = (notification: NotificationItem) => {
    void markRead(notification.id)
    setOpen(false)

    if (!notification.link) return
    if (notification.link.startsWith('/')) {
      router.push(notification.link)
      return
    }
    window.location.assign(notification.link)
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${styles.button}`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className={`absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white ${styles.badge}`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed left-3 right-3 top-[74px] z-[70] max-h-[calc(100dvh-92px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[390px] sm:max-w-[calc(100vw-2rem)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-950">Notifications</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${styles.action}`}
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Read all</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(480px,calc(100dvh-165px))] overflow-y-auto overscroll-contain">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notifications...
              </div>
            ) : error && notifications.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true)
                    void loadNotifications()
                  }}
                  className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${styles.action}`}
                >
                  Try again
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">No notifications yet</p>
                <p className="mt-1 text-xs text-slate-500">New exam, result, coursework, and account updates will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`block w-full px-4 py-4 text-left transition hover:bg-slate-50 ${notification.isRead ? 'bg-white' : styles.unread}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${notification.isRead ? 'bg-slate-200' : styles.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`text-sm ${notification.isRead ? 'font-medium text-slate-800' : 'font-semibold text-slate-950'}`}>
                            {notification.title}
                          </p>
                          <span className="shrink-0 text-[11px] font-medium text-slate-400">{formatRelativeTime(notification.createdAt)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{notification.message}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
