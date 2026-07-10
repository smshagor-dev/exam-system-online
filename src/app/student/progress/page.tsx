import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getStudentSelfProgress } from '@/services/student-progress.service'
import StudentYearProgressBoard from '@/components/student/StudentYearProgressBoard'

export default async function StudentProgressPage() {
  const session = await requireRole(UserRole.STUDENT)
  const progress = await getStudentSelfProgress(session.user.id)

  if (!progress) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Student profile not configured. Contact admin.</p>
      </div>
    )
  }

  return <StudentYearProgressBoard data={progress} />
}
