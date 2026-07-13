import { UserRole } from '@prisma/client'
import { auth } from './auth'
import { teacherHasPhase8Permission, type Phase8Permission } from './exam-scheduling-permissions'
import { canManageDepartment, type PermissionContext } from './permissions'
import { prisma } from './prisma'

export async function getPhase8SessionContext() {
  const session = await auth()
  if (!session?.user?.id || !session.user.role) {
    return null
  }

  return {
    session,
    ctx: {
      userId: session.user.id,
      role: session.user.role,
    } satisfies PermissionContext,
  }
}

export async function requirePhase8AdminAccess(departmentId?: string | null) {
  const payload = await getPhase8SessionContext()
  if (!payload) return null

  if (payload.ctx.role === UserRole.SUPER_ADMIN) {
    return payload
  }

  if (payload.ctx.role === UserRole.DEPARTMENT_ADMIN) {
    if (!departmentId) {
      return payload
    }
    return (await canManageDepartment(payload.ctx, departmentId)) ? payload : null
  }

  return null
}

export async function requirePhase8Permission(
  permission: Phase8Permission,
  scope?: { departmentId?: string | null; campusId?: string | null }
) {
  const payload = await getPhase8SessionContext()
  if (!payload) return null

  if (payload.ctx.role === UserRole.SUPER_ADMIN) {
    return payload
  }

  if (payload.ctx.role === UserRole.DEPARTMENT_ADMIN) {
    if (!scope?.departmentId) {
      return payload
    }
    return (await canManageDepartment(payload.ctx, scope.departmentId)) ? payload : null
  }

  if (payload.ctx.role === UserRole.TEACHER) {
    return (await teacherHasPhase8Permission(payload.ctx, permission, scope)) ? payload : null
  }

  return null
}

export async function getPhase8AccessibleDepartmentIds(
  payload: NonNullable<Awaited<ReturnType<typeof getPhase8SessionContext>>>
) {
  if (payload.ctx.role === UserRole.SUPER_ADMIN) {
    return null
  }

  if (payload.ctx.role === UserRole.DEPARTMENT_ADMIN) {
    const departments = await prisma.department.findMany({
      where: { adminId: payload.session.user.id },
      select: { id: true },
    })
    return departments.map((department) => department.id)
  }

  if (payload.ctx.role === UserRole.TEACHER) {
    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId: payload.session.user.id },
      select: { departmentId: true },
    })
    return teacher?.departmentId ? [teacher.departmentId] : []
  }

  return []
}

export async function getPhase8DepartmentScopeWhere(
  payload: NonNullable<Awaited<ReturnType<typeof getPhase8SessionContext>>>,
  requestedDepartmentId?: string | null,
  includeGlobal = false
) {
  const departmentIds = await getPhase8AccessibleDepartmentIds(payload)
  if (departmentIds === null) {
    if (requestedDepartmentId) {
      return { departmentId: requestedDepartmentId }
    }
    return {}
  }

  const allowedDepartmentIds = requestedDepartmentId
    ? departmentIds.filter((departmentId) => departmentId === requestedDepartmentId)
    : departmentIds

  if (includeGlobal) {
    return {
      OR: [
        {
          departmentId: {
            in: allowedDepartmentIds,
          },
        },
        {
          departmentId: null,
        },
      ],
    }
  }

  return {
    departmentId: {
      in: allowedDepartmentIds,
    },
  }
}
