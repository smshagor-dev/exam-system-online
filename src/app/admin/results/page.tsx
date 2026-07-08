import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'

export default async function AdminResultsPage() {
  const scope = await getAdminScope()

  const results = await prisma.examResult.findMany({
    where: scope.isSuperAdmin ? undefined : { exam: { departmentId: { in: scope.managedDepartmentIds } } },
    include: {
      exam: { include: { subject: true, department: true } },
      attempt: {
        include: {
          student: { include: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const totalPublished = results.filter((r) => r.status === 'PUBLISHED').length
  const totalPending = results.filter((r) => r.status === 'PENDING_REVIEW').length
  const avgScore = results.length
    ? (results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(1)
    : '0'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Results Overview</h1>
        <p className="text-gray-500 mt-1">{scope.isSuperAdmin ? 'All exam results system-wide' : 'All exam results in your department'}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Results', value: results.length, color: 'text-blue-600' },
          { label: 'Published', value: totalPublished, color: 'text-green-600' },
          { label: 'Pending Review', value: totalPending, color: 'text-orange-600' },
          { label: 'Avg Score', value: `${avgScore}%`, color: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
              <th className="px-5 py-3 text-left">Student</th>
              <th className="px-5 py-3 text-left">Exam</th>
              <th className="px-5 py-3 text-left">Score</th>
              <th className="px-5 py-3 text-left">Grade</th>
              <th className="px-5 py-3 text-left">Result</th>
              <th className="px-5 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {results.map((result) => (
              <tr key={result.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 text-sm font-medium text-gray-900">
                  {result.attempt.student.user.name}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  <p>{result.exam.title}</p>
                  <p className="text-xs text-gray-400">{result.exam.subject.name}</p>
                </td>
                <td className="px-5 py-4 text-sm">
                  <span className="font-semibold">{result.marksObtained}/{result.totalMarks}</span>
                  <span className="text-gray-400 ml-1">({result.percentage.toFixed(1)}%)</span>
                </td>
                <td className="px-5 py-4">
                  <span className="font-bold text-sm bg-gray-100 px-2 py-0.5 rounded">{result.grade}</span>
                </td>
                <td className="px-5 py-4">
                  <span className={`text-xs font-semibold ${result.isPassed ? 'text-green-600' : 'text-red-600'}`}>
                    {result.isPassed ? 'PASS' : 'FAIL'}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    result.status === 'PUBLISHED' ? 'bg-green-100 text-green-700'
                    : result.status === 'PENDING_REVIEW' ? 'bg-orange-100 text-orange-600'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {result.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">No results yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
