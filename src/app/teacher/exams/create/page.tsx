import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import CreateExamForm from './CreateExamForm'

export default async function CreateExamPage() {
  const session = await requireRole(UserRole.TEACHER)

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      assignments: {
        include: {
          department: true,
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
      },
    },
  })

  if (!profile || profile.assignments.length === 0) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <div className="text-5xl mb-4">📋</div>
        <h2 className="text-xl font-semibold text-gray-900">No Assignments Yet</h2>
        <p className="text-gray-500 mt-2">
          You need at least one assignment before creating exams. Contact admin.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create New Exam</h1>
        <p className="text-gray-500 mt-1">Configure your exam and select questions from your question bank</p>
      </div>
      <CreateExamForm assignments={profile.assignments} />
    </div>
  )
}
