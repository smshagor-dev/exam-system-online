import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExamStatus, UserRole } from '@prisma/client'
import Link from 'next/link'

async function getTeacherStats(userId: string) {
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId },
    include: { assignments: true },
  })
  if (!profile) return null

  const [totalExams, liveExams, totalQuestions, pendingReviews, totalEbooks, recentExams] = await Promise.all([
    prisma.exam.count({ where: { teacherId: profile.id } }),
    prisma.exam.count({ where: { teacherId: profile.id, status: ExamStatus.LIVE } }),
    prisma.question.count({ where: { teacherId: profile.id } }),
    prisma.examResult.count({
      where: {
        exam: { teacherId: profile.id },
        status: 'PENDING_REVIEW',
      },
    }),
    prisma.ebookUpload.count({ where: { teacherId: profile.id } }),
    prisma.exam.findMany({
      where: { teacherId: profile.id },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        subject: true,
        group: true,
        academicYear: true,
        semester: true,
        _count: { select: { attempts: true, questions: true } },
      },
    }),
  ])

  return { profile, totalExams, liveExams, totalQuestions, pendingReviews, totalEbooks, recentExams }
}

export default async function TeacherDashboard() {
  const session = await requireRole(UserRole.TEACHER)
  const data = await getTeacherStats(session.user.id)

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Teacher profile not found. Please contact admin.</p>
      </div>
    )
  }

  const stats = [
    { label: 'Assignments', value: data.profile.assignments.length },
    { label: 'Total Exams', value: data.totalExams },
    { label: 'Live Exams', value: data.liveExams },
    { label: 'Question Bank', value: data.totalQuestions },
    { label: 'Ebooks', value: data.totalEbooks },
    { label: 'Pending Reviews', value: data.pendingReviews },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
          <p className="mt-1 text-gray-500">Manage your assignments, questions, exams, and reviews.</p>
        </div>
        <Link
          href="/teacher/exams/create"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          + Create Exam
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Link
          href="/teacher/assignments"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
        >
          <h2 className="font-semibold text-gray-900">My Assignments</h2>
          <p className="mt-1 text-sm text-gray-500">Check your assigned subjects, groups, years, and semesters.</p>
        </Link>
        <Link
          href="/teacher/questions"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
        >
          <h2 className="font-semibold text-gray-900">Question Bank</h2>
          <p className="mt-1 text-sm text-gray-500">Create and manage questions for your assigned classes.</p>
        </Link>
        <Link
          href="/teacher/ebooks"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
        >
          <h2 className="font-semibold text-gray-900">Teacher Ebooks</h2>
          <p className="mt-1 text-sm text-gray-500">Upload and manage PDF ebooks by language, year, semester, and group.</p>
        </Link>
        <Link
          href="/teacher/reviews"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
        >
          <h2 className="font-semibold text-gray-900">Review Answers</h2>
          <p className="mt-1 text-sm text-gray-500">
            {data.pendingReviews > 0
              ? `${data.pendingReviews} review${data.pendingReviews > 1 ? 's' : ''} pending now.`
              : 'No pending reviews right now.'}
          </p>
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">Recent Exams</h2>
            <p className="mt-1 text-sm text-gray-500">Latest exams created from your workspace</p>
          </div>
          <Link href="/teacher/exams" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            View all
          </Link>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-5 py-3">Exam</th>
              <th className="px-5 py-3">Subject / Scope</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Questions</th>
              <th className="px-5 py-3">Attempts</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.recentExams.map((exam) => (
              <tr key={exam.id} className="hover:bg-gray-50">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-900 text-sm">{exam.title}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {exam.duration} min · {exam.totalMarks} marks
                  </p>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  <p>{exam.subject.name}</p>
                  <p className="text-xs text-gray-400">
                    {exam.group.name} · {exam.academicYear.name} · {exam.semester.name}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={exam.status} />
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{exam._count.questions}</td>
                <td className="px-5 py-4 text-sm text-gray-600">{exam._count.attempts}</td>
                <td className="px-5 py-4">
                  <div className="flex gap-3">
                    {exam.status === ExamStatus.LIVE && (
                      <Link
                        href={`/teacher/exams/${exam.id}/live`}
                        className="text-xs font-medium text-green-600 hover:text-green-700"
                      >
                        Monitor
                      </Link>
                    )}
                    <Link
                      href={`/teacher/exams/${exam.id}/results`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Results
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {data.recentExams.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                  No exams yet.{' '}
                  <Link href="/teacher/exams/create" className="text-blue-600 hover:underline">
                    Create your first exam
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    SCHEDULED: 'bg-blue-100 text-blue-700',
    LIVE: 'bg-green-100 text-green-700',
    COMPLETED: 'bg-orange-100 text-orange-700',
    RESULT_PUBLISHED: 'bg-purple-100 text-purple-700',
  }

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
