import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import StudentLifecycleActionWorkspace from '@/components/admin/StudentLifecycleActionWorkspace'

export default async function GraduationPage() {
  const scope = await getAdminScope()

  const [graduations, activeEnrollments] = await Promise.all([
    prisma.studentGraduation.findMany({
      where: scope.isSuperAdmin ? undefined : { enrollment: { departmentId: { in: scope.managedDepartmentIds } } },
      include: {
        student: { include: { user: true } },
        enrollment: { include: { program: true } },
      },
      orderBy: { graduatedAt: 'desc' },
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
  ])

  return (
    <StudentLifecycleActionWorkspace
      title="Graduation Workflow"
      description="Graduate eligible students, close active academic progression, and preserve immutable lifecycle history including final CGPA and certificate data."
      actionEndpoint="/api/admin/graduations"
      actionLabel="Create graduation"
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
        { key: 'graduatedAt', label: 'Graduation Date', type: 'date', required: true },
        { key: 'finalCgpa', label: 'Final CGPA', type: 'number' },
        { key: 'degreeClassification', label: 'Degree Classification', type: 'text' },
        { key: 'certificateNumber', label: 'Certificate Number', type: 'text' },
        { key: 'degreeAwarded', label: 'Degree Awarded', type: 'text', required: true },
        { key: 'alumniAt', label: 'Alumni Date', type: 'date' },
        { key: 'notes', label: 'Completion Note', type: 'textarea' },
      ]}
      recordsTitle="Graduation Registry"
      recordsDescription="Graduations are unique per student, remove active enrollment, and stay visible in student-facing academic history."
      columns={[
        { key: 'student', label: 'Student' },
        { key: 'program', label: 'Program' },
        { key: 'graduatedAt', label: 'Graduated' },
        { key: 'cgpa', label: 'Final CGPA' },
        { key: 'classification', label: 'Classification' },
        { key: 'degree', label: 'Degree Awarded' },
        { key: 'certificate', label: 'Certificate No.' },
      ]}
      rows={graduations.map((item) => ({
        student: item.student.user.name,
        program: item.enrollment.program.name,
        graduatedAt: item.graduatedAt.toISOString().slice(0, 10),
        cgpa: item.finalCgpa ?? '-',
        classification: item.degreeClassification ?? '-',
        degree: item.degreeAwarded,
        certificate: item.certificateNumber ?? '-',
      }))}
    />
  )
}
