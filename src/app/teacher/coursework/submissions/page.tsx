import TeacherCourseworkEnterpriseNav from '@/components/teacher/TeacherCourseworkEnterpriseNav'
import TeacherCourseworkSubmissionInbox from '@/components/teacher/TeacherCourseworkSubmissionInbox'
import { requireRole } from '@/lib/auth'
import { getTeacherCourseworkSubmissionInbox } from '@/lib/coursework-enterprise-workspace'
import { UserRole } from '@prisma/client'

export default async function TeacherCourseworkSubmissionsPage() {
  const session = await requireRole(UserRole.TEACHER)
  const attempts = await getTeacherCourseworkSubmissionInbox(session.user.id)

  if (!attempts) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
    <div className="space-y-6">
      <TeacherCourseworkEnterpriseNav />
      <TeacherCourseworkSubmissionInbox attempts={attempts} />
    </div>
  )
}
