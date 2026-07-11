import { UserRole } from '@prisma/client'
import { auth } from './auth'
import { getAdminScope } from './admin-scope'

export async function requireAdminApiSession() {
  const session = await auth()

  if (!session?.user) {
    throw new Error('UNAUTHORIZED')
  }

  if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN) {
    throw new Error('FORBIDDEN')
  }

  return session
}

export async function requireAdminApiScope() {
  return getAdminScope()
}

export function parseListParams(url: string) {
  const { searchParams } = new URL(url)
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1)
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '20') || 20))
  const search = (searchParams.get('search') || '').trim()
  const sort = (searchParams.get('sort') || 'createdAt').trim()
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc'

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    search,
    sort,
    order,
    searchParams,
  }
}

export function getApiErrorStatus(message: string) {
  if (message === 'UNAUTHORIZED') return 401
  if (message === 'FORBIDDEN') return 403
  if (
    message.startsWith('Invalid') ||
    message.includes('not found') ||
    message.includes('required') ||
    message.includes('belongs') ||
    message.includes('support') ||
    message.includes('exceeds') ||
    message.includes('mapped') ||
    message.includes('curriculum') ||
    message.includes('duplicate')
  ) {
    return 400
  }

  return 500
}
