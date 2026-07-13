import { requireRole } from '@/lib/auth'
import { resolveExamTranslation } from '@/lib/academic-content'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { studentCanAccessExam } from '@/lib/permissions'

type PageProps = { params: Promise<{ id: string }> }

export default async function StudentExamDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await requireRole(UserRole.STUDENT)

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (!studentProfile) notFound()

  const access = await studentCanAccessExam(session.user.id, id)
  if (!access.allowed) {
    notFound()
  }

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      translations: true,
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      teacher: { include: { user: { select: { name: true } } } },
      _count: { select: { questions: true } },
    },
  })

  if (!exam) notFound()
  const resolvedExam = resolveExamTranslation(exam, exam.languageId)

  const attempt = await prisma.studentExamAttempt.findUnique({
    where: {
      examId_studentId: { examId: id, studentId: studentProfile.id },
    },
  })

  const alreadySubmitted =
    attempt?.status === 'SUBMITTED' || attempt?.status === 'AUTO_SUBMITTED'

  const now = new Date()
  const hasStarted = now >= exam.startTime
  const hasEnded = now > exam.endTime
  const isAvailableNow =
    (resolvedExam.status === 'SCHEDULED' || resolvedExam.status === 'LIVE') && hasStarted && !hasEnded
  const inProgressAttempt = attempt?.status === 'IN_PROGRESS'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div
          className={`px-6 py-3 text-sm font-medium ${
            isAvailableNow
              ? 'bg-green-500 text-white'
              : !hasStarted
              ? 'bg-blue-500 text-white'
              : hasEnded
              ? 'bg-gray-200 text-gray-600'
              : 'bg-orange-500 text-white'
          }`}
        >
          {isAvailableNow
            ? 'Available Now'
            : !hasStarted
            ? 'Scheduled'
            : hasEnded
            ? 'Completed'
            : 'Exam Window Active'}
        </div>

        <div className="p-6">
          <h1 className="mb-1 text-2xl font-bold text-gray-900">{resolvedExam.title}</h1>
          {resolvedExam.description && <p className="mb-4 text-gray-500">{resolvedExam.description}</p>}

          <div className="mb-6 grid grid-cols-2 gap-4">
            <InfoItem label="Subject" value={resolvedExam.subject.name} />
            <InfoItem label="Department Language" value={resolvedExam.language.name} />
            <InfoItem label="Group" value={resolvedExam.group.name} />
            <InfoItem label="Academic Year" value={resolvedExam.academicYear.name} />
            <InfoItem label="Semester" value={resolvedExam.semester.name} />
            <InfoItem label="Duration" value={`${resolvedExam.duration} minutes`} />
            <InfoItem label="Total Marks" value={String(resolvedExam.totalMarks)} />
            <InfoItem label="Passing Marks" value={String(resolvedExam.passingMarks)} />
            <InfoItem label="Questions" value={String(resolvedExam._count.questions)} />
            <InfoItem label="Start Time" value={new Date(resolvedExam.startTime).toLocaleString()} />
            <InfoItem label="End Time" value={new Date(resolvedExam.endTime).toLocaleString()} />
          </div>

          {resolvedExam.instructions && (
            <div className="mb-6 rounded-xl bg-blue-50 p-4">
              <p className="mb-1 text-sm font-semibold text-blue-900">Instructions</p>
              <p className="whitespace-pre-line text-sm text-blue-800">{resolvedExam.instructions}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {alreadySubmitted ? (
              <div className="py-4 text-center">
                <div className="mb-2 text-4xl">Done</div>
                <p className="font-semibold text-green-700">You have already submitted this exam.</p>
                <p className="mt-1 text-sm text-gray-500">Results will be published soon.</p>
              </div>
            ) : isAvailableNow ? (
              <Link
                href={`/student/exams/${id}/attempt`}
                className="w-full rounded-xl bg-green-600 py-3 text-center text-lg font-semibold text-white transition hover:bg-green-700"
              >
                {inProgressAttempt ? 'Resume Exam ->' : 'Start Exam ->'}
              </Link>
            ) : !hasStarted ? (
              <div className="rounded-xl bg-blue-50 py-4 text-center">
                <p className="font-medium text-blue-800">Exam starts at:</p>
                <p className="mt-1 text-lg font-bold text-blue-900">
                  {new Date(resolvedExam.startTime).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 py-4 text-center">
                <p className="text-gray-500">This exam has ended.</p>
              </div>
            )}

            <Link href="/student/exams" className="text-center text-sm text-gray-500 hover:text-gray-700">
              {'<-'} Back to all exams
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="mb-0.5 text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}
