import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function ProgramYearsPage() {
  const scope = await getAdminScope()
  const [itemsRaw, programs] = await Promise.all([
    prisma.programYear.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      include: { program: true },
      orderBy: [{ program: { name: 'asc' } }, { yearNumber: 'asc' }],
    }),
    prisma.academicProgram.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
  ])

  const items = itemsRaw.map((item) => ({
    ...item,
    programName: item.program.name,
  }))

  return (
    <SimpleEntityManager
      title="Program Years"
      singularLabel="Program Year"
      items={items}
      columns={[
        { key: 'programName', label: 'Program' },
        { key: 'name', label: 'Name' },
        { key: 'yearNumber', label: 'Year Number' },
        { key: 'code', label: 'Code' },
      ]}
      fields={[
        {
          key: 'programId',
          label: 'Program',
          type: 'select',
          required: true,
          options: programs.map((program) => ({ value: program.id, label: program.name })),
        },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'yearNumber', label: 'Year Number', type: 'number', required: true },
        { key: 'sortOrder', label: 'Sort Order', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/program-years"
      formMode="modal"
    />
  )
}

