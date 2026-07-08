import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole, ExamStatus } from '@prisma/client'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  LIVE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-orange-100 text-orange-700',
  RESULT_PUBLISHED: 'bg-purple-100 text-purple-700',
}

export default async function TeacherExamsPage() {
  const session = await requireRole(UserRole.TEACHER)

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (!profile) return <div className="py-20 text-center text-gray-500">Profile not found.</div>

  const exams = await prisma.exam.findMany({
    where: { teacherId: profile.id },
    include: {
      subject: true,
      group: true,
      academicYear: true,
      semester: true,
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Exams</h1>
          <p className="text-gray-500 mt-1">{exams.length} exam{exams.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link href="/teacher/exams/create"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + Create Exam
        </Link>
      </div>

      {exams.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <div className="text-5xl mb-4">📝</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Exams Yet</h2>
          <p className="text-gray-500 mb-6">Create your first exam from your question bank.</p>
          <Link href="/teacher/exams/create"
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 inline-block">
            Create Exam
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                <th className="px-5 py-3 text-left">Exam</th>
                <th className="px-5 py-3 text-left">Subject / Group</th>
                <th className="px-5 py-3 text-left">Schedule</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Attempts</th>
                <th className="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {exams.map((exam) => (
                <tr key={exam.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900 text-sm">{exam.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {exam.duration} min · {exam.totalMarks} marks · {exam._count.questions} questions
                    </p>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    <p>{exam.subject.name}</p>
                    <p className="text-xs text-gray-400">{exam.group.name} · {exam.academicYear.name} · {exam.semester.name}</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-600">
                    <p>Start: {new Date(exam.startTime).toLocaleString()}</p>
                    <p>End: {new Date(exam.endTime).toLocaleString()}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[exam.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {exam.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{exam._count.attempts}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-3 flex-wrap">
                      {exam.status === ExamStatus.LIVE && (
                        <Link href={`/teacher/exams/${exam.id}/live`}
                          className="text-xs text-green-600 font-semibold hover:text-green-700">
                          Monitor
                        </Link>
                      )}
                      {(exam.status === ExamStatus.COMPLETED || exam.status === ExamStatus.RESULT_PUBLISHED) && (
                        <>
                          <Link href={`/teacher/exams/${exam.id}/answers`}
                            className="text-xs text-orange-600 font-medium hover:text-orange-700">
                            Review
                          </Link>
                          <Link href={`/teacher/exams/${exam.id}/results`}
                            className="text-xs text-blue-600 font-medium hover:text-blue-700">
                            Results
                          </Link>
                        </>
                      )}
                      {exam.status === ExamStatus.DRAFT && (
                        <span className="text-xs text-gray-400">Draft</span>
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
