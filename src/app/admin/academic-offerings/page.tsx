import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

function formatDateTime(value: Date | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : ''
}

export default async function AcademicOfferingsPage() {
  const scope = await getAdminScope()
  const [itemsRaw, sessions, programs, departments, departmentLanguages, programYears, programSemesters, semesters, groups, subjects, programSubjects] = await Promise.all([
    prisma.academicOffering.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: {
        academicSession: true,
        program: true,
        department: true,
        language: true,
        programYear: true,
        semester: true,
        group: true,
        subject: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.academicSession.findMany({ where: { isActive: true }, orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] }),
    prisma.academicProgram.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({
      where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.departmentLanguage.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { department: true, language: true },
      orderBy: [{ department: { name: 'asc' } }, { language: { name: 'asc' } }],
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
    prisma.group.findMany({ orderBy: { name: 'asc' } }),
    prisma.subject.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.programSubject.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { sortOrder: 'asc' }],
    }),
  ])

  const items = itemsRaw.map((item) => ({
    ...item,
    sessionName: item.academicSession.name,
    programName: item.program.name,
    departmentName: item.department.name,
    languageName: item.language.name,
    programYearName: item.programYear.name,
    semesterName: item.semester.name,
    groupName: item.group.name,
    subjectName: item.subject.name,
    startsAt: formatDateTime(item.startsAt),
    endsAt: formatDateTime(item.endsAt),
  }))

  return (
    <SimpleEntityManager
      title="Academic Offerings"
      singularLabel="Academic Offering"
      items={items}
      columns={[
        { key: 'sessionName', label: 'Session' },
        { key: 'programName', label: 'Program' },
        { key: 'programYearName', label: 'Program Year' },
        { key: 'semesterName', label: 'Semester' },
        { key: 'groupName', label: 'Group' },
        { key: 'subjectName', label: 'Subject' },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { key: 'academicSessionId', label: 'Academic Session', type: 'select', required: true, options: sessions.map((item) => ({ value: item.id, label: item.name })) },
        { key: 'programId', label: 'Program', type: 'select', required: true, options: programs.map((item) => ({ value: item.id, label: item.name })) },
        { key: 'departmentId', label: 'Department', type: 'select', required: true, options: departments.map((item) => ({ value: item.id, label: item.name })) },
        {
          key: 'departmentLanguageId',
          label: 'Department Language',
          type: 'select',
          dependsOn: ['departmentId', 'languageId'],
          options: departmentLanguages.map((item) => ({
            value: item.id,
            label: `${item.department.name} / ${item.language.name}`,
            meta: { departmentId: item.departmentId, languageId: item.languageId },
          })),
        },
        {
          key: 'languageId',
          label: 'Language',
          type: 'select',
          required: true,
          dependsOn: ['departmentId'],
          options: departmentLanguages.map((item) => ({
            value: item.languageId,
            label: item.language.name,
            meta: { departmentId: item.departmentId },
          })),
        },
        {
          key: 'programYearId',
          label: 'Program Year',
          type: 'select',
          required: true,
          dependsOn: ['programId'],
          options: programYears.map((item) => ({ value: item.id, label: item.name, meta: { programId: item.programId } })),
        },
        { key: 'semesterId', label: 'Semester', type: 'select', required: true, options: semesters.map((item) => ({ value: item.id, label: item.name })) },
        {
          key: 'programSemesterId',
          label: 'Program Semester',
          type: 'select',
          dependsOn: ['programId', 'programYearId'],
          options: programSemesters.map((item) => ({
            value: item.id,
            label: `#${item.semesterNumber}`,
            meta: { programId: item.programId, programYearId: item.programYearId },
          })),
        },
        {
          key: 'groupId',
          label: 'Group',
          type: 'select',
          required: true,
          dependsOn: ['programId', 'academicSessionId'],
          options: groups.map((item) => ({
            value: item.id,
            label: item.name,
            meta: { programId: item.programId ?? '', academicSessionId: item.academicSessionId ?? '' },
          })),
        },
        {
          key: 'subjectId',
          label: 'Subject',
          type: 'select',
          required: true,
          dependsOn: ['programId', 'programYearId', 'semesterId'],
          options: programSubjects.flatMap((item) => {
            const subject = subjects.find((subject) => subject.id === item.subjectId)
            if (!subject) return []
            return [{
              value: subject.id,
              label: subject.name,
              meta: { programId: item.programId, programYearId: item.programYearId, semesterId: item.semesterId },
            }]
          }),
        },
        {
          key: 'programSubjectId',
          label: 'Program Subject',
          type: 'select',
          dependsOn: ['programId', 'programYearId', 'semesterId'],
          options: programSubjects.map((item) => ({
            value: item.id,
            label: item.subjectId,
            meta: { programId: item.programId, programYearId: item.programYearId, semesterId: item.semesterId },
          })),
        },
        { key: 'status', label: 'Status', type: 'select', required: true, options: ['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map((value) => ({ value, label: value })) },
        { key: 'startsAt', label: 'Starts At', type: 'datetime-local' },
        { key: 'endsAt', label: 'Ends At', type: 'datetime-local' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/academic-offerings"
      formMode="modal"
    />
  )
}
