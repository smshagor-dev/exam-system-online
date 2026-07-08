import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

export default async function StudentResultsPage() {
  const session = await requireRole(UserRole.STUDENT)

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  })

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Student profile not found.</div>
  }

  const results = await prisma.examResult.findMany({
    where: { studentId: profile.id, status: 'PUBLISHED' },
    include: {
      exam: { include: { subject: true, department: true } },
    },
    orderBy: { publishedAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Results</h1>
        <p className="text-gray-500 mt-1">{results.length} published result{results.length !== 1 ? 's' : ''}</p>
      </div>

      {results.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Results Yet</h2>
          <p className="text-gray-500">Results will appear here once your teacher publishes them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((result) => (
            <Link
              key={result.id}
              href={`/student/results/${result.id}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 truncate">
                    {result.exam.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">{result.exam.subject.name}</p>
                </div>
                <div className={`ml-3 text-lg font-bold px-3 py-1 rounded-xl ${
                  result.isPassed
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-600'
                }`}>
                  {result.grade}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {result.marksObtained}<span className="text-base font-normal text-gray-400">/{result.totalMarks}</span>
                  </p>
                  <p className="text-xs text-gray-500">{result.percentage.toFixed(1)}%</p>
                </div>
                <div className="flex-1" />
                <div className="text-right">
                  <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                    result.isPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {result.isPassed ? 'PASSED' : 'FAILED'}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">
                    {result.publishedAt ? new Date(result.publishedAt).toLocaleDateString() : ''}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${result.isPassed ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, result.percentage)}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
