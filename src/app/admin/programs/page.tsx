import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function ProgramsPage() {
  const scope = await getAdminScope()
  const [programs, departments, degreeLevels] = await Promise.all([
    prisma.academicProgram.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { department: true, degreeLevel: true },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.department.findMany({
      where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.degreeLevel.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ])

  const items = programs.map((program) => ({
    ...program,
    departmentName: program.department.name,
    degreeLevelName: program.degreeLevel.name,
  }))

  return (
    <SimpleEntityManager
      title="Academic Programs"
      singularLabel="Program"
      items={items}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'degreeLevelName', label: 'Degree Level' },
        { key: 'departmentName', label: 'Department' },
        { key: 'durationYears', label: 'Years' },
        { key: 'totalSemesters', label: 'Semesters' },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        {
          key: 'degreeLevelId',
          label: 'Degree Level',
          type: 'select',
          required: true,
          options: degreeLevels.map((degreeLevel) => ({ value: degreeLevel.id, label: degreeLevel.name })),
        },
        {
          key: 'departmentId',
          label: 'Department',
          type: 'select',
          required: true,
          options: departments.map((department) => ({ value: department.id, label: department.name })),
        },
        { key: 'durationYears', label: 'Duration Years', type: 'number', required: true },
        { key: 'totalSemesters', label: 'Total Semesters', type: 'number', required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/programs"
      formMode="modal"
    />
  )
}

