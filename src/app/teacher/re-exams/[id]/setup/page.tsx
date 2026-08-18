import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getReExamRecord } from '@/lib/reexam-store'
import ReExamSetupForm from '@/components/teacher/ReExamSetupForm'
import { UserRole } from '@prisma/client'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function TeacherReExamSetupPage({ params }: PageProps) {
  const session = await requireRole(UserRole.TEACHER)
  const { id } = await params
  const record = await getReExamRecord(id)

  if (!record || record.teacherUserId !== session.user.id || record.status !== 'APPROVED' || !record.reExamId) {
    notFound()
  }

  const [exam, student] = await Promise.all([
    prisma.exam.findUnique({
      where: { id: record.reExamId },
      select: {
        id: true,
        title: true,
        description: true,
        duration: true,
        totalMarks: true,
        passingMarks: true,
        startTime: true,
        endTime: true,
        instructions: true,
        status: true,
        autoPublish: true,
        showAnswers: true,
        showMarks: true,
        subject: { select: { name: true } },
        group: { select: { name: true } },
        _count: { select: { questions: true } },
      },
    }),
    prisma.studentProfile.findUnique({
      where: { id: record.studentId },
      select: { user: { select: { name: true, email: true } } },
    }),
  ])

  if (!exam || !student) notFound()

  return (
    <div className="space-y-4">
      <Link href="/teacher/re-exams" className="inline-flex text-sm font-medium text-sky-700 hover:text-sky-800">
        ← Back to Re-exam Management
      </Link>
      <ReExamSetupForm
        exam={{
          id: exam.id,
          title: exam.title,
          description: exam.description,
          duration: exam.duration,
          totalMarks: exam.totalMarks,
          passingMarks: exam.passingMarks,
          startTime: exam.startTime.toISOString(),
          endTime: exam.endTime.toISOString(),
          instructions: exam.instructions,
          status: exam.status,
          autoPublish: exam.autoPublish,
          showAnswers: exam.showAnswers,
          showMarks: exam.showMarks,
          questionCount: exam._count.questions,
          subjectName: exam.subject.name,
          groupName: exam.group.name,
        }}
        studentName={student.user.name}
        studentEmail={student.user.email}
        type={record.type}
        reason={record.reason}
      />
    </div>
  )
}
