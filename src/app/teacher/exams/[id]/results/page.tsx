import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type PageProps = { params: Promise<{ id: string }> }

export default async function TeacherExamResultsPage({ params }: PageProps) {
  const { id } = await params
  const session = await requireRole(UserRole.TEACHER)

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (!teacherProfile) notFound()

  const exam = await prisma.exam.findFirst({
    where: { id, teacherId: teacherProfile.id },
    include: {
      subject: true,
      _count: { select: { attempts: true } },
    },
  })
  if (!exam) notFound()

  const results = await prisma.examResult.findMany({
    where: { examId: id },
    include: {
      attempt: {
        include: {
          student: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
    orderBy: { marksObtained: 'desc' },
  })

  const published = results.filter((r) => r.status === 'PUBLISHED').length
  const pending = results.filter((r) => r.status === 'PENDING_REVIEW').length
  const avgScore = results.length
    ? results.reduce((sum, r) => sum + r.percentage, 0) / results.length
    : 0
  const passCount = results.filter((r) => r.isPassed).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exam Results</h1>
          <p className="text-gray-500 mt-1">{exam.title} · {exam.subject.name}</p>
        </div>
        <Link href="/teacher/exams" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to exams
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Attempts', value: results.length, color: 'text-blue-600' },
          { label: 'Published', value: published, color: 'text-green-600' },
          { label: 'Pending Review', value: pending, color: 'text-orange-600' },
          { label: 'Pass Rate', value: `${results.length ? Math.round((passCount / results.length) * 100) : 0}%`, color: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          No attempts yet for this exam.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                <th className="px-5 py-3 text-left">Student</th>
                <th className="px-5 py-3 text-left">Score</th>
                <th className="px-5 py-3 text-left">Grade</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Result</th>
                <th className="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {results.map((result) => (
                <tr key={result.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900 text-sm">
                      {result.attempt.student.user.name}
                    </p>
                    <p className="text-xs text-gray-400">{result.attempt.student.user.email}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900">
                      {result.marksObtained}/{result.totalMarks}
                    </p>
                    <p className="text-xs text-gray-400">{result.percentage.toFixed(1)}%</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm font-bold bg-gray-100 px-2 py-0.5 rounded">
                      {result.grade}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      result.status === 'PUBLISHED' ? 'bg-green-100 text-green-700'
                      : result.status === 'PENDING_REVIEW' ? 'bg-orange-100 text-orange-600'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                      {result.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-semibold ${result.isPassed ? 'text-green-600' : 'text-red-600'}`}>
                      {result.isPassed ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      {result.status === 'PENDING_REVIEW' && (
                        <Link
                          href={`/teacher/exams/${id}/answers?resultId=${result.id}`}
                          className="text-xs text-orange-600 font-medium hover:text-orange-700"
                        >
                          Review
                        </Link>
                      )}
                      {result.status === 'REVIEWED' && (
                        <form action={`/api/results/${result.id}`} method="PATCH">
                          <Link
                            href={`/teacher/exams/${id}/answers?resultId=${result.id}`}
                            className="text-xs text-blue-600 font-medium hover:text-blue-700"
                          >
                            Publish
                          </Link>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
