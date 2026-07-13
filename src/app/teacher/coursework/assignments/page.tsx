import TeacherCourseworkAssignmentStudio from '@/components/teacher/TeacherCourseworkAssignmentStudio'
import TeacherCourseworkEnterpriseNav from '@/components/teacher/TeacherCourseworkEnterpriseNav'
import { requireRole } from '@/lib/auth'
import { getTeacherEnterpriseCourseworkWorkspace } from '@/lib/coursework-enterprise-workspace'
import { UserRole } from '@prisma/client'

export default async function TeacherCourseworkAssignmentsPage() {
  const session = await requireRole(UserRole.TEACHER)
  const workspace = await getTeacherEnterpriseCourseworkWorkspace(session.user.id)

  if (!workspace) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
    <div className="space-y-6">
      <TeacherCourseworkEnterpriseNav />
      <TeacherCourseworkAssignmentStudio templates={workspace.templates} publications={workspace.publications} />
    </div>
  )
}
