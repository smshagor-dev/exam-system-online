import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import StudentClassTestClient from '@/components/class-tests/StudentClassTestClient'

type PageProps = { params: Promise<{ id: string }> }

export default async function StudentClassTestPage({ params }: PageProps) {
  await requireRole(UserRole.STUDENT)
  const { id } = await params
  return <StudentClassTestClient classTestId={id} />
}
