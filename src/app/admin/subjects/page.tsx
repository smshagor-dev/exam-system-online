import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function SubjectsPage() {
  const scope = await getAdminScope()

  const [subjectRecords, departments] = await Promise.all([
    prisma.subject.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { department: true, _count: { select: { teacherAssignments: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({
      where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
  ])

  const subjects = subjectRecords.map((subject) => ({
    ...subject,
    departmentName: subject.department?.name ?? '—',
    teacherCount: subject._count?.teacherAssignments ?? 0,
  }))

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
    { key: 'departmentName', label: 'Department' },
    { key: 'teacherCount', label: 'Teachers' },
  ]

  const fields = [
    { key: 'name', label: 'Subject Name', type: 'text' as const, required: true },
    { key: 'code', label: 'Code', type: 'text' as const, required: true },
    {
      key: 'departmentId',
      label: 'Department',
      type: 'select' as const,
      required: true,
      options: departments.map((d) => ({ value: d.id, label: d.name })),
    },
    { key: 'description', label: 'Description', type: 'textarea' as const },
  ]

  return (
    <SimpleEntityManager
      title="Subjects"
      items={subjects}
      columns={columns}
      fields={fields}
      apiBase="/api/admin/subjects"
    />
  )
}
