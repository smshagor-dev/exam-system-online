import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import QuestionBankManager from './QuestionBankManager'

export default async function QuestionsPage() {
  const session = await requireRole(UserRole.TEACHER)

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      assignments: {
        include: {
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
          department: true,
        },
      },
    },
  })

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Teacher profile not found. Contact admin.</p>
      </div>
    )
  }

  const questions = await prisma.question.findMany({
    where: { teacherId: profile.id },
    include: {
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      options: { orderBy: { orderIndex: 'asc' } },
      _count: { select: { examQuestions: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
        <p className="text-gray-500 mt-1">{questions.length} questions across your assignments</p>
      </div>
      <QuestionBankManager questions={questions} assignments={profile.assignments} teacherId={profile.id} />
    </div>
  )
}
