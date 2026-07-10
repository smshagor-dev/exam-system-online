import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import StudentProgressDetailView from '@/components/students/StudentProgressDetailView'
import { getAdminScope } from '@/lib/admin-scope'
import { getStudentProgressDetail } from '@/services/student-progress.service'

type Props = {
  params: Promise<{
    id: string
  }>
}

export default async function AdminStudentDetailPage({ params }: Props) {
  const scope = await getAdminScope()
  const { id } = await params
  const detail = await getStudentProgressDetail(
    { userId: scope.session.user.id, role: scope.session.user.role },
    id
  )

  if (!detail) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Student not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/students"
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition hover:text-blue-800"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Students
      </Link>
      <StudentProgressDetailView detail={detail} />
    </div>
  )
}
