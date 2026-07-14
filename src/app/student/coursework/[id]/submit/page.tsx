import StudentCourseworkSubmitForm from '@/components/student/StudentCourseworkSubmitForm'
import { requireRole } from '@/lib/auth'
import { getStudentCourseworkPublicationWorkspace } from '@/lib/coursework-enterprise-workspace'
import { UserRole } from '@prisma/client'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function StudentCourseworkSubmitPage({ params }: PageProps) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const workspace = await getStudentCourseworkPublicationWorkspace(session.user.id, id)
  const publication = workspace?.publication

  if (!publication) {
    return <div className="py-20 text-center text-gray-500">Coursework not found or not available to you.</div>
  }

  return <StudentCourseworkSubmitForm publication={publication} />
}
