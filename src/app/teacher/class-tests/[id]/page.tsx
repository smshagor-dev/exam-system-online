import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import TeacherClassTestDetailClient from '@/components/class-tests/TeacherClassTestDetailClient'

type PageProps = { params: Promise<{ id: string }> }

export default async function TeacherClassTestDetailPage({ params }: PageProps) {
  await requireRole(UserRole.TEACHER)
  const { id } = await params
  return <TeacherClassTestDetailClient classTestId={id} />
}
