import path from 'path'

export const COURSEWORK_DIR = path.join(process.cwd(), 'public', 'uploads', 'coursework')
export const MAX_COURSEWORK_SIZE = 10 * 1024 * 1024

export function sanitizeCourseworkFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').toLowerCase()
}

export function formatCourseworkStatus(status: 'PENDING' | 'ACCEPTED' | 'REJECTED') {
  if (status === 'ACCEPTED') return 'Accepted'
  if (status === 'REJECTED') return 'Rejected'
  return 'Pending'
}

export function formatCourseworkAccessRequestStatus(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  if (status === 'APPROVED') return 'Approved'
  if (status === 'REJECTED') return 'Rejected'
  return 'Pending'
}

export function formatCourseworkDeadline(value: string | Date | null | undefined) {
  if (!value) {
    return 'No deadline'
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'No deadline'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function isCourseworkDeadlinePassed(value: string | Date | null | undefined) {
  if (!value) {
    return false
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  return date.getTime() < Date.now()
}

export function getCourseworkActiveDeadline(baseDeadline: string | Date | null | undefined, extensionDeadline?: string | Date | null | undefined) {
  if (extensionDeadline) {
    const extension = extensionDeadline instanceof Date ? extensionDeadline : new Date(extensionDeadline)
    if (!Number.isNaN(extension.getTime()) && extension.getTime() > Date.now()) {
      return extension
    }
  }

  if (!baseDeadline) {
    return null
  }

  const base = baseDeadline instanceof Date ? baseDeadline : new Date(baseDeadline)
  if (Number.isNaN(base.getTime())) {
    return null
  }

  return base
}
