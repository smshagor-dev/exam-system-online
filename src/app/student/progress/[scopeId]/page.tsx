import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getStudentSelfProgressSubject } from '@/services/student-progress.service'
import StudentSubjectProgressPage from '@/components/student/StudentSubjectProgressPage'

type Props = {
  params: Promise<{
    scopeId: string
  }>
}

export default async function StudentProgressSubjectPage({ params }: Props) {
  const session = await requireRole(UserRole.STUDENT)
  const { scopeId } = await params
  const progress = await getStudentSelfProgressSubject(session.user.id, scopeId)

  if (!progress) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Subject progress not found.</p>
      </div>
    )
  }

  return <StudentSubjectProgressPage data={progress} />
}
