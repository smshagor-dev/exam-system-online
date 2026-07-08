import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type PageProps = { params: Promise<{ id: string }> }

export default async function StudentExamDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await requireRole(UserRole.STUDENT)

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (!studentProfile) notFound()

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
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

  const attempt = await prisma.studentExamAttempt.findUnique({
    where: {
      examId_studentId: { examId: id, studentId: studentProfile.id },
    },
  })

  const alreadySubmitted =
    attempt?.status === 'SUBMITTED' || attempt?.status === 'AUTO_SUBMITTED'

  const now = new Date()
  const isLive = exam.status === 'LIVE'
  const hasStarted = now >= exam.startTime
  const hasEnded = now > exam.endTime

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Status banner */}
        <div className={`px-6 py-3 text-sm font-medium ${
          isLive ? 'bg-green-500 text-white'
          : !hasStarted ? 'bg-blue-500 text-white'
          : hasEnded ? 'bg-gray-200 text-gray-600'
          : 'bg-orange-500 text-white'
        }`}>
          {isLive ? '🔴 Live Now' : !hasStarted ? '📅 Scheduled' : hasEnded ? 'Completed' : 'Exam in Progress'}
        </div>

        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{exam.title}</h1>
          {exam.description && <p className="text-gray-500 mb-4">{exam.description}</p>}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <InfoItem label="Subject" value={exam.subject.name} />
            <InfoItem label="Language" value={exam.language.name} />
            <InfoItem label="Group" value={exam.group.name} />
            <InfoItem label="Academic Year" value={exam.academicYear.name} />
            <InfoItem label="Semester" value={exam.semester.name} />
            <InfoItem label="Duration" value={`${exam.duration} minutes`} />
            <InfoItem label="Total Marks" value={String(exam.totalMarks)} />
            <InfoItem label="Passing Marks" value={String(exam.passingMarks)} />
            <InfoItem label="Questions" value={String(exam._count.questions)} />
            <InfoItem
              label="Start Time"
              value={new Date(exam.startTime).toLocaleString()}
            />
            <InfoItem
              label="End Time"
              value={new Date(exam.endTime).toLocaleString()}
            />
          </div>

          {exam.instructions && (
            <div className="bg-blue-50 rounded-xl p-4 mb-6">
              <p className="text-sm font-semibold text-blue-900 mb-1">📋 Instructions</p>
              <p className="text-sm text-blue-800 whitespace-pre-line">{exam.instructions}</p>
            </div>
          )}

          {/* CTA */}
          <div className="flex flex-col gap-3">
            {alreadySubmitted ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-semibold text-green-700">You have already submitted this exam.</p>
                <p className="text-sm text-gray-500 mt-1">Results will be published soon.</p>
              </div>
            ) : isLive ? (
              <Link
                href={`/student/exams/${id}/attempt`}
                className="w-full py-3 bg-green-600 text-white rounded-xl text-center font-semibold text-lg hover:bg-green-700 transition"
              >
                Start Exam Now →
              </Link>
            ) : !hasStarted ? (
              <div className="text-center py-4 bg-blue-50 rounded-xl">
                <p className="text-blue-800 font-medium">Exam starts at:</p>
                <p className="text-blue-900 font-bold text-lg mt-1">
                  {new Date(exam.startTime).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-center py-4 bg-gray-50 rounded-xl">
                <p className="text-gray-500">This exam has ended.</p>
              </div>
            )}

            <Link href="/student/exams" className="text-center text-sm text-gray-500 hover:text-gray-700">
              ← Back to all exams
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}
