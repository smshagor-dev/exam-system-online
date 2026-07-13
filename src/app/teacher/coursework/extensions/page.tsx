import TeacherCourseworkEnterpriseNav from '@/components/teacher/TeacherCourseworkEnterpriseNav'
import TeacherCourseworkExtensionsStudio from '@/components/teacher/TeacherCourseworkExtensionsStudio'
import { requireRole } from '@/lib/auth'
import { getTeacherEnterpriseCourseworkWorkspace } from '@/lib/coursework-enterprise-workspace'
import { UserRole } from '@prisma/client'

export default async function TeacherCourseworkExtensionsPage() {
  const session = await requireRole(UserRole.TEACHER)
  const workspace = await getTeacherEnterpriseCourseworkWorkspace(session.user.id)

  if (!workspace) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
    <div className="space-y-6">
      <TeacherCourseworkEnterpriseNav />
      <TeacherCourseworkExtensionsStudio requests={workspace.extensionRequests} />
    </div>
  )
}
