import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import RichTextContent from '@/components/editor/RichTextContent'
import { CodeBlock } from '@/components/code/CodeEditor'
import { parseQuestionCodeMetadata } from '@/lib/question-code'
import { loadAttemptSnapshot } from '@/server/exam-attempt-snapshot'

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

  const snapshot = await loadAttemptSnapshot(result.attemptId)
  const answerMap = Object.fromEntries(result.attempt.answers.map((answer) => [answer.questionId, answer]))
  const displayedQuestions = snapshot
    ? snapshot.questions.map((entry) => ({
        id: entry.examQuestionId,
        questionId: entry.id,
        marks: entry.marks,
        orderIndex: entry.orderIndex,
        question: {
          id: entry.id,
          text: entry.question.text,
          type: entry.question.type,
          options: entry.question.options,
        },
      }))
    : result.exam.questions

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className={`rounded-2xl p-6 text-white ${result.isPassed ? 'bg-gradient-to-br from-green-500 to-green-600' : 'bg-gradient-to-br from-red-500 to-red-600'}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 text-sm text-white/80">{result.exam.subject.name}</p>
            <h1 className="text-xl font-bold">{result.exam.title}</h1>
          </div>
          <div className="text-right"><div className="text-5xl font-bold">{result.grade}</div></div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-white/20 p-3 text-center"><p className="text-2xl font-bold">{result.marksObtained}</p><p className="text-xs text-white/80">Marks Obtained</p></div>
          <div className="rounded-xl bg-white/20 p-3 text-center"><p className="text-2xl font-bold">{result.totalMarks}</p><p className="text-xs text-white/80">Total Marks</p></div>
          <div className="rounded-xl bg-white/20 p-3 text-center"><p className="text-2xl font-bold">{result.percentage.toFixed(1)}%</p><p className="text-xs text-white/80">Percentage</p></div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/30"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, result.percentage)}%` }} /></div>
          <span className="text-sm font-semibold">{result.isPassed ? '✓ PASSED' : '✗ FAILED'}</span>
        </div>
      </div>

      {result.exam.showAnswers && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900">Answer Review</h2>
          {displayedQuestions.map((examQuestion, index) => {
            const answer = answerMap[examQuestion.questionId]
            const effectiveMarks = answer?.teacherMarks ?? answer?.marksAwarded ?? 0
            const isAutoType = examQuestion.question.type === 'MCQ' || examQuestion.question.type === 'TRUE_FALSE'
            const correct = answer?.isCorrect
            const parsedQuestion = parseQuestionCodeMetadata(examQuestion.question.text)
            const codeMeta = parsedQuestion.metadata

            return (
              <div key={examQuestion.id} className={`rounded-xl border-2 bg-white p-5 ${correct === true ? 'border-green-200' : correct === false ? 'border-red-200' : 'border-gray-200'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-500">Q{index + 1}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${examQuestion.question.type === 'MCQ' ? 'bg-blue-100 text-blue-700' : examQuestion.question.type === 'TRUE_FALSE' ? 'bg-green-100 text-green-700' : examQuestion.question.type === 'SHORT_ANSWER' ? 'bg-yellow-100 text-yellow-700' : 'bg-purple-100 text-purple-700'}`}>
                      {examQuestion.question.type.replace('_', ' ')}
                    </span>
                    {codeMeta.contentMode === 'TEXT_CODE' && <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">CODE</span>}
                    {codeMeta.answerMode === 'CODE' && <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">CODE ANSWER</span>}
                  </div>
                  {result.exam.showMarks && <span className={`text-sm font-bold ${correct === true ? 'text-green-600' : correct === false ? 'text-red-600' : 'text-gray-600'}`}>{effectiveMarks}/{examQuestion.marks}</span>}
                </div>

                <RichTextContent html={parsedQuestion.text} className="rich-text-content mb-3 text-gray-900" />
                {codeMeta.contentMode === 'TEXT_CODE' && codeMeta.codeContent && <div className="mb-4"><CodeBlock code={codeMeta.codeContent} language={codeMeta.codeLanguage} label="Question Code" /></div>}

                {isAutoType && (
                  <div className="space-y-2">
                    {examQuestion.question.options.map((option) => {
                      const isSelected = option.id === answer?.selectedOption
                      return (
                        <div key={option.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${option.isCorrect ? 'border border-green-200 bg-green-100 text-green-800' : isSelected && !option.isCorrect ? 'border border-red-200 bg-red-100 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                          {option.isCorrect ? '✓' : isSelected ? '✗' : '○'} {option.text}
                          {isSelected && !option.isCorrect && <span className="ml-auto text-xs">(Your answer)</span>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {!isAutoType && (
                  <div className="space-y-2">
                    {codeMeta.answerMode === 'CODE' ? (
                      answer?.answerText
                        ? <CodeBlock code={answer.answerText} language={codeMeta.answerCodeLanguage} label="Your Code Answer" />
                        : <div className="rounded-lg bg-gray-50 p-3 text-sm italic text-gray-400">No answer provided</div>
                    ) : (
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="mb-1 text-xs font-medium text-gray-500">Your Answer:</p>
                        <p className="whitespace-pre-wrap text-sm text-gray-900">{answer?.answerText || <span className="italic text-gray-400">No answer provided</span>}</p>
                      </div>
                    )}
                    {answer?.teacherFeedback && <div className="rounded-lg border border-blue-100 bg-blue-50 p-3"><p className="mb-1 text-xs font-medium text-blue-700">Teacher Feedback:</p><p className="text-sm text-blue-900">{answer.teacherFeedback}</p></div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="text-center"><Link href="/student/results" className="inline-block rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700">← Back to Results</Link></div>
    </div>
  )
}
