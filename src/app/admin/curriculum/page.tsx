import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function CurriculumPage() {
  const scope = await getAdminScope()
  const [itemsRaw, programs, programYears, programSemesters, semesters, subjects] = await Promise.all([
    prisma.programSubject.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      include: { program: true, programYear: true, semester: true, subject: true, programSemester: true },
      orderBy: [{ program: { name: 'asc' } }, { sortOrder: 'asc' }, { subject: { name: 'asc' } }],
    }),
    prisma.academicProgram.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.programYear.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { yearNumber: 'asc' }],
    }),
    prisma.programSemester.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { semesterNumber: 'asc' }],
    }),
    prisma.semester.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
    prisma.subject.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
  ])

  const items = itemsRaw.map((item) => ({
    ...item,
    programName: item.program.name,
    programYearName: item.programYear.name,
    semesterName: item.semester.name,
    subjectName: item.subject.name,
  }))

  return (
    <SimpleEntityManager
      title="Curriculum"
      singularLabel="Program Subject"
      items={items}
      columns={[
        { key: 'programName', label: 'Program' },
        { key: 'programYearName', label: 'Program Year' },
        { key: 'semesterName', label: 'Semester' },
        { key: 'subjectName', label: 'Subject' },
      ]}
      fields={[
        {
          key: 'programId',
          label: 'Program',
          type: 'select',
          required: true,
          options: programs.map((program) => ({ value: program.id, label: program.name })),
        },
        {
          key: 'programYearId',
          label: 'Program Year',
          type: 'select',
          required: true,
          dependsOn: ['programId'],
          options: programYears.map((programYear) => ({
            value: programYear.id,
            label: programYear.name,
            meta: { programId: programYear.programId },
          })),
        },
        {
          key: 'semesterId',
          label: 'Semester',
          type: 'select',
          required: true,
          options: semesters.map((semester) => ({ value: semester.id, label: semester.name })),
        },
        {
          key: 'programSemesterId',
          label: 'Program Semester',
          type: 'select',
          dependsOn: ['programId', 'programYearId'],
          options: programSemesters.map((programSemester) => ({
            value: programSemester.id,
            label: `#${programSemester.semesterNumber}`,
            meta: { programId: programSemester.programId, programYearId: programSemester.programYearId },
          })),
        },
        {
          key: 'subjectId',
          label: 'Subject',
          type: 'select',
          required: true,
          options: subjects.map((subject) => ({ value: subject.id, label: subject.name })),
        },
        { key: 'creditHours', label: 'Credit Hours', type: 'number' },
        { key: 'theoryHours', label: 'Theory Hours', type: 'number' },
        { key: 'practicalHours', label: 'Practical Hours', type: 'number' },
        { key: 'sortOrder', label: 'Sort Order', type: 'number' },
        { key: 'isElective', label: 'Elective', type: 'checkbox' },
        { key: 'isRequired', label: 'Required', type: 'checkbox' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/program-subjects"
      formMode="modal"
    />
  )
}
