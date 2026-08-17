import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStudentSelfProgress } from '@/services/student-progress.service'
import StudentYearProgressBoard, {
  type StudentActiveStudyContext,
} from '@/components/student/StudentYearProgressBoard'
import { StudentEnrollmentStatus, UserRole } from '@prisma/client'

export default async function StudentProgressPage() {
  const session = await requireRole(UserRole.STUDENT)

  const [progress, profile] = await Promise.all([
    getStudentSelfProgress(session.user.id),
    prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        enrollments: {
          where: {
            status: StudentEnrollmentStatus.ACTIVE,
            isActive: true,
          },
          orderBy: { enrolledAt: 'desc' },
          take: 1,
          select: {
            academicYearId: true,
            department: { select: { name: true } },
            academicSession: { select: { name: true } },
            program: { select: { name: true } },
            programYear: { select: { name: true, yearNumber: true } },
            semester: { select: { name: true, number: true } },
            group: { select: { name: true } },
            academicYear: { select: { name: true, year: true } },
            language: { select: { name: true } },
            departmentLanguage: {
              select: {
                language: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ])

  if (!progress) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Student profile not configured. Contact admin.</p>
      </div>
    )
  }

  const enrollment = profile?.enrollments[0] ?? null
  const activeContext: StudentActiveStudyContext | null = enrollment
    ? {
        departmentName: enrollment.department.name,
        academicSessionName: enrollment.academicSession.name,
        programName: enrollment.program.name,
        programYearName: enrollment.programYear.name,
        programYearNumber: enrollment.programYear.yearNumber,
        academicYearId: enrollment.academicYearId,
        academicYearName: enrollment.academicYear?.name ?? enrollment.programYear.name,
        academicYearNumber: enrollment.academicYear?.year ?? enrollment.programYear.yearNumber,
        semesterName: enrollment.semester.name,
        semesterNumber: enrollment.semester.number,
        groupName: enrollment.group.name,
        languageName:
          enrollment.language?.name ?? enrollment.departmentLanguage?.language.name ?? 'Not set',
      }
    : null

  return <StudentYearProgressBoard data={progress} activeContext={activeContext} />
}
