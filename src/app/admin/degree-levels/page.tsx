import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function DegreeLevelsPage() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const items = await prisma.degreeLevel.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })

  return (
    <SimpleEntityManager
      title="Degree Levels"
      singularLabel="Degree Level"
      items={items}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'defaultYears', label: 'Default Years' },
        { key: 'isActive', label: 'Active' },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'defaultYears', label: 'Default Years', type: 'number' },
        { key: 'sortOrder', label: 'Sort Order', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/degree-levels"
      canCreate
      canEdit
      canDelete
      formMode="modal"
    />
  )
}

