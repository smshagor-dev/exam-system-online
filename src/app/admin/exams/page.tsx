import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  LIVE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-orange-100 text-orange-700',
  RESULT_PUBLISHED: 'bg-purple-100 text-purple-700',
}

export default async function AdminExamsPage() {
  const scope = await getAdminScope()

  const exams = await prisma.exam.findMany({
    where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
    include: {
      subject: true,
      department: true,
      teacher: { include: { user: { select: { name: true } } } },
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Exams</h1>
        <p className="text-gray-500 mt-1">{exams.length} total exams{scope.isSuperAdmin ? ' across all departments' : ' in your department'}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
              <th className="px-5 py-3 text-left">Exam</th>
              <th className="px-5 py-3 text-left">Department / Subject</th>
              <th className="px-5 py-3 text-left">Teacher</th>
              <th className="px-5 py-3 text-left">Schedule</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Stats</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {exams.map((exam) => (
              <tr key={exam.id} className="hover:bg-gray-50">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-900 text-sm">{exam.title}</p>
                  <p className="text-xs text-gray-400">{exam.duration} min · {exam.totalMarks} marks</p>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  <p>{exam.department.name}</p>
                  <p className="text-xs text-gray-400">{exam.subject.name}</p>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{exam.teacher.user.name}</td>
                <td className="px-5 py-4 text-xs text-gray-500">
                  <p>{new Date(exam.startTime).toLocaleString()}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[exam.status] ?? 'bg-gray-100'}`}>
                    {exam.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-gray-500">
                  <p>{exam._count.questions} Q</p>
                  <p>{exam._count.attempts} attempts</p>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">No exams yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
