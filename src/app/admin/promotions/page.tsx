import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import PromotionWorkflowWorkspace from '@/components/admin/PromotionWorkflowWorkspace'

export default async function PromotionsPage() {
  const scope = await getAdminScope()

  const [promotions, activeEnrollments, departments, sessions, programs, years, semesters, programYears, programSemesters, departmentLanguages, groups] = await Promise.all([
    prisma.studentPromotion.findMany({
      where: scope.isSuperAdmin ? undefined : { fromEnrollment: { departmentId: { in: scope.managedDepartmentIds } } },
      include: {
        student: { include: { user: true } },
        fromProgram: true,
        toProgram: true,
        fromProgramYear: true,
        toProgramYear: true,
        fromSemester: true,
        toSemester: true,
        fromGroup: true,
        toGroup: true,
      },
      orderBy: { promotedAt: 'desc' },
    }),
    prisma.studentEnrollment.findMany({
      where: {
        status: 'ACTIVE',
        isActive: true,
        ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
      },
      include: {
        student: { include: { user: true } },
        program: true,
        programYear: true,
        semester: true,
        group: true,
      },
      orderBy: [{ programId: 'asc' }, { enrolledAt: 'desc' }],
    }),
    prisma.department.findMany({ where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } }, orderBy: { name: 'asc' } }),
    prisma.academicSession.findMany({ where: { isActive: true }, orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] }),
    prisma.academicProgram.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.academicYear.findMany({ orderBy: { year: 'asc' } }),
    prisma.semester.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
    prisma.programYear.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { yearNumber: 'asc' }],
    }),
    prisma.programSemester.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { semesterNumber: 'asc' }],
    }),
    prisma.departmentLanguage.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { language: true },
      orderBy: [{ departmentId: 'asc' }, { language: { name: 'asc' } }],
    }),
    prisma.group.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <PromotionWorkflowWorkspace
      fields={[
        {
          key: 'studentId',
          label: 'Student',
          type: 'select',
          required: true,
          options: activeEnrollments.map((item) => ({
            value: item.studentId,
            label: `${item.student.user.name} (${item.program.name} / ${item.programYear.name} / ${item.group.name})`,
          })),
        },
        { key: 'departmentId', label: 'Target Department', type: 'select', required: true, options: departments.map((item) => ({ value: item.id, label: item.name })) },
        { key: 'academicSessionId', label: 'Target Session', type: 'select', required: true, options: sessions.map((item) => ({ value: item.id, label: item.name })) },
        {
          key: 'programId',
          label: 'Target Program',
          type: 'select',
          required: true,
          dependsOn: ['departmentId'],
          options: programs.map((item) => ({ value: item.id, label: item.name, meta: { departmentId: item.departmentId } })),
        },
        {
          key: 'programYearId',
          label: 'Target Program Year',
          type: 'select',
          required: true,
          dependsOn: ['programId'],
          options: programYears.map((item) => ({ value: item.id, label: item.name, meta: { programId: item.programId } })),
        },
        { key: 'academicYearId', label: 'Academic Year', type: 'select', options: years.map((item) => ({ value: item.id, label: item.name })) },
        { key: 'semesterId', label: 'Target Semester', type: 'select', required: true, options: semesters.map((item) => ({ value: item.id, label: item.name })) },
        {
          key: 'programSemesterId',
          label: 'Target Program Semester',
          type: 'select',
          dependsOn: ['programId', 'programYearId', 'semesterId'],
          options: programSemesters.map((item) => ({
            value: item.id,
            label: `Semester #${item.semesterNumber}`,
            meta: { programId: item.programId, programYearId: item.programYearId, semesterId: item.semesterId },
          })),
        },
        {
          key: 'languageId',
          label: 'Target Language',
          type: 'select',
          dependsOn: ['departmentId'],
          options: departmentLanguages.map((item) => ({
            value: item.languageId,
            label: item.language.name,
            meta: { departmentId: item.departmentId },
          })),
        },
        {
          key: 'departmentLanguageId',
          label: 'Target Department Language',
          type: 'select',
          dependsOn: ['departmentId', 'languageId'],
          options: departmentLanguages.map((item) => ({
            value: item.id,
            label: item.language.name,
            meta: { departmentId: item.departmentId, languageId: item.languageId },
          })),
        },
        {
          key: 'groupId',
          label: 'Target Group',
          type: 'select',
          required: true,
          dependsOn: ['departmentId', 'programId', 'academicSessionId', 'programYearId'],
          options: groups.map((item) => ({
            value: item.id,
            label: item.name,
            meta: {
              departmentId: item.departmentId ?? '',
              programId: item.programId ?? '',
              academicSessionId: item.academicSessionId ?? '',
              programYearId: item.programYearId ?? '',
            },
          })),
        },
        { key: 'manualOverride', label: 'Manual Override', type: 'checkbox' },
        { key: 'overrideReason', label: 'Override Reason', type: 'textarea' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      activeStudents={activeEnrollments.map((item) => ({
        id: item.studentId,
        label: `${item.student.user.name} (${item.student.user.email})`,
        currentProgram: item.program.name,
        currentYear: item.programYear.name,
        currentSemester: item.semester.name,
        currentGroup: item.group.name,
      }))}
      columns={[
        { key: 'student', label: 'Student' },
        { key: 'fromProgram', label: 'From Program' },
        { key: 'toProgram', label: 'To Program' },
        { key: 'fromYear', label: 'From Year' },
        { key: 'toYear', label: 'To Year' },
        { key: 'fromSemester', label: 'From Semester' },
        { key: 'toSemester', label: 'To Semester' },
        { key: 'status', label: 'Status' },
      ]}
      rows={promotions.map((item) => ({
        student: item.student.user.name,
        fromProgram: item.fromProgram.name,
        toProgram: item.toProgram.name,
        fromYear: item.fromProgramYear.name,
        toYear: item.toProgramYear.name,
        fromSemester: item.fromSemester.name,
        toSemester: item.toSemester.name,
        status: item.status,
      }))}
    />
  )
}
