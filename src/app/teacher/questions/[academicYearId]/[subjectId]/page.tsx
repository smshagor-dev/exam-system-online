import Link from 'next/link'
import { notFound } from 'next/navigation'
import { UserRole } from '@prisma/client'
import QuestionBankManager from '../../QuestionBankManager'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type PageProps = {
  params: Promise<{
    academicYearId: string
    subjectId: string
  }>
}

export default async function SubjectQuestionBankPage({ params }: PageProps) {
  const session = await requireRole(UserRole.TEACHER)
  const { academicYearId, subjectId } = await params

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      assignments: {
        where: {
          academicYearId,
          subjectId,
        },
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
    notFound()
  }

  if (profile.assignments.length === 0) {
    notFound()
  }

  const questions = await prisma.question.findMany({
    where: {
      teacherId: profile.id,
      academicYearId,
      subjectId,
    },
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

  const subject = profile.assignments[0].subject
  const academicYear = profile.assignments[0].academicYear
  const groups = Array.from(new Set(profile.assignments.map((assignment) => assignment.group.name)))
  const semesters = Array.from(new Set(profile.assignments.map((assignment) => assignment.semester.name)))
  const languages = Array.from(new Set(profile.assignments.map((assignment) => assignment.language.name)))

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/teacher/questions" className="inline-flex text-sm font-medium text-blue-600 hover:text-blue-700">
          Back to year-wise subject list
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600">{academicYear.name}</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900">{subject.name} Question Bank</h1>
              <p className="mt-2 text-sm text-gray-500">
                Added questions for this subject are shown below. Use add question to create more.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-gray-600">
              <span className="rounded-full bg-gray-100 px-3 py-1.5">Groups: {groups.join(', ')}</span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5">Semesters: {semesters.join(', ')}</span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5">Languages: {languages.join(', ')}</span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5">Questions: {questions.length}</span>
            </div>
          </div>
        </div>
      </div>

      <QuestionBankManager
        questions={questions}
        createHref={`/teacher/questions/${academicYearId}/${subjectId}/new`}
      />
    </div>
  )
}
