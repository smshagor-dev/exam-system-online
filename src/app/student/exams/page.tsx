import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

export default async function StudentExamsPage() {
  const session = await requireRole(UserRole.STUDENT)

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: { subjects: true },
  })

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Student profile not found.</div>
  }

  const now = new Date()
    const orConditions = profile.subjects.map((s) => ({
      subjectId: s.subjectId,
      languageId: s.languageId,
      groupId: s.groupId,
      academicYearId: s.academicYearId,
      semesterId: s.semesterId,
      departmentId: profile.departmentId,
    }))

  if (orConditions.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My Exams</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-sm text-yellow-800">
          You are not enrolled in any subjects yet. Contact your department admin.
        </div>
      </div>
    )
  }

  const [liveExams, upcomingExams, completedExams] = await Promise.all([
    prisma.exam.findMany({
      where: { OR: orConditions, status: 'LIVE' },
      include: {
        subject: true,
        _count: { select: { questions: true } },
      },
    }),
    prisma.exam.findMany({
      where: { OR: orConditions, status: 'SCHEDULED', startTime: { gt: now } },
      include: { subject: true, _count: { select: { questions: true } } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.exam.findMany({
      where: { OR: orConditions, status: { in: ['COMPLETED', 'RESULT_PUBLISHED'] } },
      include: {
        subject: true,
        attempts: {
          where: { studentId: profile.id },
          select: { status: true, submittedAt: true },
        },
      },
      orderBy: { endTime: 'desc' },
      take: 20,
    }),
  ])

  // Fetch attempt statuses
  const attemptMap = Object.fromEntries(
    (
      await prisma.studentExamAttempt.findMany({
        where: {
          studentId: profile.id,
          examId: { in: [...liveExams, ...upcomingExams, ...completedExams].map((e) => e.id) },
        },
        select: { examId: true, status: true },
      })
    ).map((a) => [a.examId, a.status])
  )

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">My Exams</h1>

      {/* Live Exams */}
      {liveExams.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <h2 className="font-semibold text-gray-900">Live Now ({liveExams.length})</h2>
          </div>
          <div className="space-y-3">
            {liveExams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-xl border-2 border-green-300 p-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{exam.title}</h3>
                  <p className="text-sm text-gray-500">{exam.subject.name} · {exam._count.questions} questions · {exam.duration} min</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Total: <span className="font-medium">{exam.totalMarks} marks</span>
                    {' · '}Passing: <span className="font-medium">{exam.passingMarks}</span>
                  </p>
                </div>
                <div>
                  {attemptMap[exam.id] === 'SUBMITTED' || attemptMap[exam.id] === 'AUTO_SUBMITTED' ? (
                    <span className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium">
                      Submitted ✓
                    </span>
                  ) : (
                    <Link href={`/student/exams/${exam.id}`}
                      className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition">
                      Join Exam →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Exams */}
      <section>
        <h2 className="font-semibold text-gray-900 mb-3">Upcoming Exams ({upcomingExams.length})</h2>
        {upcomingExams.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
            No upcoming exams
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingExams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{exam.title}</h3>
                    <p className="text-sm text-gray-500">{exam.subject.name} · {exam._count.questions} questions</p>
                    <p className="text-sm text-blue-600 mt-1 font-medium">
                      📅 {new Date(exam.startTime).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Duration: {exam.duration} min · {exam.totalMarks} marks
                    </p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
                    Scheduled
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Completed Exams */}
      {completedExams.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-900 mb-3">Past Exams</h2>
          <div className="space-y-3">
            {completedExams.map((exam) => {
              const attemptStatus = attemptMap[exam.id]
              return (
                <div key={exam.id} className="bg-white rounded-xl border border-gray-200 p-5 opacity-80">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{exam.title}</h3>
                      <p className="text-sm text-gray-500">{exam.subject.name}</p>
                    </div>
                    <div className="text-right">
                      {attemptStatus ? (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                          {attemptStatus === 'SUBMITTED' || attemptStatus === 'AUTO_SUBMITTED' ? 'Submitted' : 'Attempted'}
                        </span>
                      ) : (
                        <span className="text-xs bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full font-medium">
                          Missed
                        </span>
                      )}
                      {exam.status === 'RESULT_PUBLISHED' && (
                        <Link href="/student/results"
                          className="block text-xs text-blue-600 hover:underline mt-1">
                          View result →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
