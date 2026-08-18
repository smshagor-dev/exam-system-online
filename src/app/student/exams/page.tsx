import { requireRole } from '@/lib/auth'
import { resolveExamTranslation } from '@/lib/academic-content'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'
import { getStudentExamCatalogScope } from '@/lib/permissions'
import { getReExamVisibilityForStudent, listReExamRequestsByStudent } from '@/lib/reexam-store'

export default async function StudentExamsPage() {
  const session = await requireRole(UserRole.STUDENT)
  const [{ profile, blockedReason, subjectScopes }, reExamVisibility, reExamRequests] = await Promise.all([
    getStudentExamCatalogScope(session.user.id),
    getReExamVisibilityForStudent(session.user.id),
    listReExamRequestsByStudent(session.user.id),
  ])

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Student profile not found.</div>
  }

  const now = new Date()
  const orConditions = subjectScopes.map((subject) => ({
    subjectId: subject.subjectId,
    languageId: subject.languageId,
    groupId: subject.groupId,
    academicYearId: subject.academicYearId,
    semesterId: subject.semesterId,
    departmentId: profile.departmentId,
  }))

  const canAccessNewAttempts = !blockedReason

  if (orConditions.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My Exams</h1>
        <div className={`rounded-xl border p-6 text-sm ${blockedReason ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-yellow-200 bg-yellow-50 text-yellow-800'}`}>
          {blockedReason
            ? `${blockedReason}. New exam attempts are unavailable.`
            : 'You are not enrolled in any subjects yet. Contact your department admin.'}
        </div>
      </div>
    )
  }

  const [activeWindowExamsRaw, upcomingExamsRaw, completedExamsRaw] = await Promise.all([
    prisma.exam.findMany({
      where: {
        OR: orConditions,
        status: { in: ['SCHEDULED', 'LIVE'] },
        startTime: { lte: now },
        endTime: { gt: now },
      },
      include: {
        translations: true,
        subject: true,
        _count: { select: { questions: true } },
      },
      orderBy: { startTime: 'asc' },
    }),
    prisma.exam.findMany({
      where: {
        OR: orConditions,
        status: { in: ['SCHEDULED', 'LIVE'] },
        startTime: { gt: now },
      },
      include: { translations: true, subject: true, _count: { select: { questions: true } } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.exam.findMany({
      where: {
        AND: [
          { OR: orConditions },
          {
            OR: [
              { endTime: { lte: now } },
              { status: { in: ['COMPLETED', 'RESULT_PUBLISHED'] } },
            ],
          },
        ],
      },
      include: {
        translations: true,
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

  const allReExamIds = new Set(reExamVisibility.allReExamIds)
  const myReExamIds = new Set(reExamVisibility.studentReExamIds)
  const myReExamType = new Map(
    reExamVisibility.studentRecords
      .filter((record) => record.reExamId)
      .map((record) => [record.reExamId as string, record.type])
  )
  const requestByOriginalExam = new Map(
    reExamRequests
      .filter((record) => record.status === 'PENDING' || record.status === 'APPROVED')
      .map((record) => [record.originalExamId, record])
  )
  const isVisibleToStudent = (examId: string) => !allReExamIds.has(examId) || myReExamIds.has(examId)

  const activeWindowExams = activeWindowExamsRaw.filter((exam) => isVisibleToStudent(exam.id))
  const upcomingExams = upcomingExamsRaw.filter((exam) => isVisibleToStudent(exam.id))
  const completedExams = completedExamsRaw.filter((exam) => isVisibleToStudent(exam.id))

  const attemptMap = Object.fromEntries(
    (
      await prisma.studentExamAttempt.findMany({
        where: {
          studentId: profile.id,
          examId: {
            in: [...activeWindowExams, ...upcomingExams, ...completedExams].map((exam) => exam.id),
          },
        },
        select: { examId: true, status: true },
      })
    ).map((attempt) => [attempt.examId, attempt.status])
  )

  const resolvedActiveWindowExams = activeWindowExams.map((exam) =>
    resolveExamTranslation(exam, exam.languageId)
  )
  const resolvedUpcomingExams = upcomingExams.map((exam) =>
    resolveExamTranslation(exam, exam.languageId)
  )
  const resolvedCompletedExams = completedExams.map((exam) =>
    resolveExamTranslation(exam, exam.languageId)
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Exams</h1>
        <Link href="/student/re-exams" className="inline-flex w-fit rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100">
          Re-exam Requests
        </Link>
      </div>

      {blockedReason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {blockedReason}. New exam attempts are unavailable in your current lifecycle state.
        </div>
      )}

      {canAccessNewAttempts && resolvedActiveWindowExams.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
            <h2 className="font-semibold text-gray-900">
              Available Now ({resolvedActiveWindowExams.length})
            </h2>
          </div>
          <div className="space-y-3">
            {resolvedActiveWindowExams.map((exam) => (
              <div
                key={exam.id}
                className="flex flex-col gap-4 rounded-xl border-2 border-green-300 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{exam.title}</h3>
                    {myReExamIds.has(exam.id) && (
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                        {(myReExamType.get(exam.id) ?? 'RETAKE').replaceAll('_', ' ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {exam.subject.name} · {exam._count.questions} questions · {exam.duration} min
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Total: <span className="font-medium">{exam.totalMarks} marks</span>
                    {' · '}
                    Passing: <span className="font-medium">{exam.passingMarks}</span>
                  </p>
                </div>
                <div>
                  {attemptMap[exam.id] === 'SUBMITTED' || attemptMap[exam.id] === 'AUTO_SUBMITTED' ? (
                    <span className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">
                      Submitted
                    </span>
                  ) : (
                    <Link
                      href={`/student/exams/${exam.id}`}
                      className="inline-flex rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
                    >
                      {attemptMap[exam.id] === 'IN_PROGRESS' ? 'Resume Exam ->' : 'Start Exam ->'}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold text-gray-900">Upcoming Exams ({canAccessNewAttempts ? resolvedUpcomingExams.length : 0})</h2>
        {!canAccessNewAttempts || resolvedUpcomingExams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            {canAccessNewAttempts ? 'No upcoming exams' : 'New exam attempts are currently unavailable'}
          </div>
        ) : (
          <div className="space-y-3">
            {resolvedUpcomingExams.map((exam) => (
              <div key={exam.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{exam.title}</h3>
                      {myReExamIds.has(exam.id) && (
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                          {(myReExamType.get(exam.id) ?? 'RETAKE').replaceAll('_', ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {exam.subject.name} · {exam._count.questions} questions
                    </p>
                    <p className="mt-1 text-sm font-medium text-blue-600">
                      {new Date(exam.startTime).toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Duration: {exam.duration} min · {exam.totalMarks} marks
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                    Scheduled
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {resolvedCompletedExams.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-gray-900">Past Exams</h2>
          <div className="space-y-3">
            {resolvedCompletedExams.map((exam) => {
              const attemptStatus = attemptMap[exam.id]
              const reExamRequest = requestByOriginalExam.get(exam.id)
              const isReExam = myReExamIds.has(exam.id)

              return (
                <div key={exam.id} className="rounded-xl border border-gray-200 bg-white p-5 opacity-90">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-gray-900">{exam.title}</h3>
                        {isReExam && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Re-exam</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{exam.subject.name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {attemptStatus ? (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                          {attemptStatus === 'SUBMITTED' || attemptStatus === 'AUTO_SUBMITTED' ? 'Submitted' : 'Attempted'}
                        </span>
                      ) : (
                        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-600">
                          Missed
                        </span>
                      )}

                      {!isReExam && reExamRequest?.status === 'PENDING' && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Re-exam Pending</span>
                      )}
                      {!isReExam && reExamRequest?.status === 'APPROVED' && (
                        <Link href="/student/re-exams" className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200">
                          Re-exam Enabled
                        </Link>
                      )}
                      {!isReExam && !reExamRequest && (
                        <Link
                          href={`/student/re-exams?examId=${exam.id}`}
                          className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                        >
                          Request Re-exam
                        </Link>
                      )}

                      {exam.status === 'RESULT_PUBLISHED' && (
                        <Link
                          href="/student/results"
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          {'View result ->'}
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
