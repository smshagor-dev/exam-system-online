import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function GroupsPage() {
  await requireRole(UserRole.SUPER_ADMIN)
  const groups = await prisma.group.findMany({ orderBy: { name: 'asc' } })

  return (
    <SimpleEntityManager
      title="Groups"
      items={groups}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
      ]}
      fields={[
        { key: 'name', label: 'Group Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
      ]}
      apiBase="/api/admin/groups"
    />
  )
}
