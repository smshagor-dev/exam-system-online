import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

export default async function ReviewsPage() {
  const session = await requireRole(UserRole.TEACHER)

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (!profile) return <div className="text-gray-500 py-20 text-center">Profile not found.</div>

  const pendingResults = await prisma.examResult.findMany({
    where: {
      exam: { teacherId: profile.id },
      status: 'PENDING_REVIEW',
    },
    include: {
      exam: { include: { subject: true } },
      attempt: {
        include: {
          student: { include: { user: { select: { name: true } } } },
          answers: {
            where: { checkStatus: { in: ['UNCHECKED', 'AI_SUGGESTED'] } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Answers</h1>
        <p className="text-gray-500 mt-1">{pendingResults.length} result{pendingResults.length !== 1 ? 's' : ''} pending review</p>
      </div>

      {pendingResults.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">All caught up!</h2>
          <p className="text-gray-500">No answers pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingResults.map((result) => (
            <div key={result.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{result.exam.title}</p>
                  <p className="text-sm text-gray-500">{result.exam.subject.name}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Student: <span className="font-medium">{result.attempt.student.user.name}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-orange-600 font-medium">
                    {result.attempt.answers.length} answer{result.attempt.answers.length !== 1 ? 's' : ''} to review
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Current: {result.marksObtained}/{result.totalMarks}
                  </p>
                  <Link
                    href={`/teacher/exams/${result.examId}/answers?resultId=${result.id}`}
                    className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    Review Now →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
