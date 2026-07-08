import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type PageProps = { params: Promise<{ id: string }> }

export default async function StudentResultDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await requireRole(UserRole.STUDENT)

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (!studentProfile) notFound()

  const result = await prisma.examResult.findUnique({
    where: { id },
    include: {
      exam: {
        include: {
          subject: true,
          questions: {
            include: {
              question: {
                include: { options: { orderBy: { orderIndex: 'asc' } } },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
      attempt: {
        include: {
          answers: {
            include: { question: true },
          },
        },
      },
    },
  })

  if (!result || result.studentId !== studentProfile.id || result.status !== 'PUBLISHED') {
    notFound()
  }

  const answerMap = Object.fromEntries(result.attempt.answers.map((a) => [a.questionId, a]))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Result Header */}
      <div className={`rounded-2xl p-6 text-white ${result.isPassed ? 'bg-gradient-to-br from-green-500 to-green-600' : 'bg-gradient-to-br from-red-500 to-red-600'}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/80 text-sm mb-1">{result.exam.subject.name}</p>
            <h1 className="text-xl font-bold">{result.exam.title}</h1>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold">{result.grade}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{result.marksObtained}</p>
            <p className="text-xs text-white/80">Marks Obtained</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{result.totalMarks}</p>
            <p className="text-xs text-white/80">Total Marks</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{result.percentage.toFixed(1)}%</p>
            <p className="text-xs text-white/80">Percentage</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: `${Math.min(100, result.percentage)}%` }}
            />
          </div>
          <span className="text-sm font-semibold">{result.isPassed ? '✓ PASSED' : '✗ FAILED'}</span>
        </div>
      </div>

      {/* Question-by-question breakdown */}
      {result.exam.showAnswers && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900">Answer Review</h2>
          {result.exam.questions.map((eq, index) => {
            const answer = answerMap[eq.questionId]
            const effectiveMarks = answer?.teacherMarks ?? answer?.marksAwarded ?? 0
            const isAutoType = eq.question.type === 'MCQ' || eq.question.type === 'TRUE_FALSE'
            const correct = answer?.isCorrect
            const selectedOpt = eq.question.options.find((o) => o.id === answer?.selectedOption)

            return (
              <div key={eq.id} className={`bg-white rounded-xl border-2 p-5 ${
                correct === true ? 'border-green-200'
                : correct === false ? 'border-red-200'
                : 'border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500">Q{index + 1}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      eq.question.type === 'MCQ' ? 'bg-blue-100 text-blue-700'
                      : eq.question.type === 'TRUE_FALSE' ? 'bg-green-100 text-green-700'
                      : eq.question.type === 'SHORT_ANSWER' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-purple-100 text-purple-700'
                    }`}>
                      {eq.question.type.replace('_', ' ')}
                    </span>
                  </div>
                  {result.exam.showMarks && (
                    <span className={`text-sm font-bold ${
                      correct === true ? 'text-green-600'
                      : correct === false ? 'text-red-600'
                      : 'text-gray-600'
                    }`}>
                      {effectiveMarks}/{eq.marks}
                    </span>
                  )}
                </div>

                <p className="text-gray-900 font-medium mb-3">{eq.question.text}</p>

                {/* MCQ options */}
                {isAutoType && (
                  <div className="space-y-2">
                    {eq.question.options.map((opt) => {
                      const isSelected = opt.id === answer?.selectedOption
                      return (
                        <div key={opt.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                          opt.isCorrect
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : isSelected && !opt.isCorrect
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-gray-50 text-gray-700'
                        }`}>
                          {opt.isCorrect ? '✓' : isSelected ? '✗' : '○'} {opt.text}
                          {isSelected && !opt.isCorrect && <span className="ml-auto text-xs">(Your answer)</span>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Short/Written answer */}
                {!isAutoType && (
                  <div className="space-y-2">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Your Answer:</p>
                      <p className="text-sm text-gray-900">{answer?.answerText || <span className="italic text-gray-400">No answer provided</span>}</p>
                    </div>
                    {answer?.teacherFeedback && (
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                        <p className="text-xs font-medium text-blue-700 mb-1">Teacher Feedback:</p>
                        <p className="text-sm text-blue-900">{answer.teacherFeedback}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="text-center">
        <Link href="/student/results"
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 inline-block">
          ← Back to Results
        </Link>
      </div>
    </div>
  )
}
