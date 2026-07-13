import TeacherCourseworkEnterpriseNav from '@/components/teacher/TeacherCourseworkEnterpriseNav'
import TeacherCourseworkReportsView from '@/components/teacher/TeacherCourseworkReportsView'
import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'

export default async function TeacherCourseworkReportsPage() {
  await requireRole(UserRole.TEACHER)

  return (
    <div className="space-y-6">
      <TeacherCourseworkEnterpriseNav />
      <TeacherCourseworkReportsView />
    </div>
  )
}
