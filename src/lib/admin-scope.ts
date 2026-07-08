import { UserRole } from '@prisma/client'
import { requireRole } from './auth'
import { prisma } from './prisma'

export type AdminScope = {
  session: Awaited<ReturnType<typeof requireRole>>
  isSuperAdmin: boolean
  managedDepartmentIds: string[]
}

export async function getAdminScope(): Promise<AdminScope> {
  const session = await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const isSuperAdmin = session.user.role === UserRole.SUPER_ADMIN

  if (isSuperAdmin) {
    return { session, isSuperAdmin: true, managedDepartmentIds: [] }
  }

  const managedDepartments = await prisma.department.findMany({
    where: { adminId: session.user.id },
    select: { id: true },
  })

  return {
    session,
    isSuperAdmin: false,
    managedDepartmentIds: managedDepartments.map((department) => department.id),
  }
}

export function canAccessDepartment(scope: Pick<AdminScope, 'isSuperAdmin' | 'managedDepartmentIds'>, departmentId: string) {
  return scope.isSuperAdmin || scope.managedDepartmentIds.includes(departmentId)
}
