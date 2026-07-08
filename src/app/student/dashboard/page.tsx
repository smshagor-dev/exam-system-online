import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

async function getStudentData(userId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      subjects: {
        include: { subject: true, language: true, group: true, academicYear: true, semester: true },
      },
      department: true,
    },
  })
  if (!profile) return null

  const now = new Date()

  const orConditions = profile.subjects.map((s) => ({
    subjectId: s.subjectId,
    languageId: s.languageId,
    groupId: s.groupId,
    academicYearId: s.academicYearId,
    semesterId: s.semesterId,
    departmentId: profile.departmentId,
  }))

  const [upcomingExams, availableExams, recentResults] = await Promise.all([
    orConditions.length > 0
      ? prisma.exam.findMany({
          where: { OR: orConditions, status: { in: ['SCHEDULED', 'LIVE'] }, startTime: { gt: now } },
          include: { subject: true, _count: { select: { questions: true } } },
          take: 5,
          orderBy: { startTime: 'asc' },
        })
      : [],
    orConditions.length > 0
      ? prisma.exam.findMany({
          where: {
            OR: orConditions,
            status: { in: ['SCHEDULED', 'LIVE'] },
            startTime: { lte: now },
            endTime: { gt: now },
          },
          include: { subject: true, _count: { select: { questions: true } } },
        })
      : [],
    prisma.examResult.findMany({
      where: { studentId: profile.id, status: 'PUBLISHED' },
      include: { exam: { include: { subject: true } } },
      take: 5,
      orderBy: { publishedAt: 'desc' },
    }),
  ])

  return { profile, upcomingExams, availableExams, recentResults }
}

export default async function StudentDashboard() {
  const session = await requireRole(UserRole.STUDENT)
  const data = await getStudentData(session.user.id)

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Student profile not configured. Contact admin.</p>
      </div>
    )
  }

  const stats = [
    { label: 'Enrolled Subjects', value: data.profile.subjects.length },
    { label: 'Available Exams', value: data.availableExams.length },
    { label: 'Upcoming Exams', value: data.upcomingExams.length },
    { label: 'Published Results', value: data.recentResults.length },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Student Dashboard</h1>
        <p className="mt-1 text-gray-500">
          Department: <span className="font-medium text-gray-700">{data.profile.department.name}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {data.availableExams.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-green-900">Available Exams</h2>
              <p className="mt-1 text-sm text-green-700">
                {data.availableExams.length} exam{data.availableExams.length > 1 ? 's are' : ' is'} available right now.
              </p>
            </div>
            <Link href="/student/exams" className="text-sm font-medium text-green-700 hover:text-green-800">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {data.availableExams.map((exam) => (
              <div key={exam.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-white p-4">
                <div>
                  <p className="font-medium text-gray-900">{exam.title}</p>
                  <p className="text-sm text-gray-500">
                    {exam.subject.name} · {exam.duration} min · {exam._count.questions} questions
                  </p>
                </div>
                <Link
                  href={`/student/exams/${exam.id}`}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Start Now
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link
          href="/student/exams"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
        >
          <h2 className="font-semibold text-gray-900">My Exams</h2>
          <p className="mt-1 text-sm text-gray-500">See live, scheduled, and completed exams from your enrolled classes.</p>
        </Link>
        <Link
          href="/student/results"
          className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
        >
          <h2 className="font-semibold text-gray-900">My Results</h2>
          <p className="mt-1 text-sm text-gray-500">Track published marks, grades, and detailed exam performance.</p>
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Enrollment Scope</h2>
          <p className="mt-1 text-sm text-gray-500">
            {data.profile.subjects.length > 0
              ? `${data.profile.subjects[0].academicYear.name} · ${data.profile.subjects[0].semester.name}`
              : 'No active subject enrollment'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-gray-900">Upcoming Exams</h2>
              <p className="mt-1 text-sm text-gray-500">Your next scheduled exams</p>
            </div>
            <Link href="/student/exams" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {data.upcomingExams.map((exam) => (
              <div key={exam.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{exam.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{exam.subject.name}</p>
                    <p className="mt-1 text-xs text-blue-600">
                      {new Date(exam.startTime).toLocaleString()} · {exam.duration} min
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Scheduled
                    </span>
                    <p className="mt-1 text-xs text-gray-400">{exam._count.questions} questions</p>
                  </div>
                </div>
              </div>
            ))}
            {data.upcomingExams.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">No upcoming exams</div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-gray-900">Recent Results</h2>
              <p className="mt-1 text-sm text-gray-500">Latest published exam outcomes</p>
            </div>
            <Link href="/student/results" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {data.recentResults.map((result) => (
              <div key={result.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{result.exam.title}</p>
                    <p className="text-xs text-gray-500">{result.exam.subject.name}</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${result.isPassed ? 'text-green-600' : 'text-red-600'}`}>
                      {result.marksObtained}/{result.totalMarks}
                    </div>
                    <div className="mt-0.5 flex items-center justify-end gap-1">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold">
                        {result.grade}
                      </span>
                      <span className={`text-xs font-medium ${result.isPassed ? 'text-green-600' : 'text-red-600'}`}>
                        {result.isPassed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <Link href={`/student/results/${result.id}`} className="mt-1 block text-xs text-blue-600 hover:underline">
                      View details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            {data.recentResults.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">No results published yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
