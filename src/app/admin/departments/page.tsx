import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import DepartmentManager from './DepartmentManager'

export default async function DepartmentsPage() {
  const scope = await getAdminScope()

  const departments = await prisma.department.findMany({
    where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } },
    include: {
      admin: { select: { name: true, email: true } },
      _count: {
        select: { subjects: true, teachers: true, students: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500 mt-1">{departments.length} departments configured</p>
        </div>
      </div>

      <DepartmentManager
        departments={departments}
        canCreate={scope.isSuperAdmin}
        canDelete={scope.isSuperAdmin}
      />
    </div>
  )
}
