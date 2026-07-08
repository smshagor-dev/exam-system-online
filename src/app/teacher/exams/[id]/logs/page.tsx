import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import ExamSecurityLogView from '@/components/exams/ExamSecurityLogView'

type Props = {
  params: Promise<{ id: string }>
}

export default async function TeacherExamLogsPage({ params }: Props) {
  const session = await requireRole(UserRole.TEACHER)
  const { id } = await params

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  const exam = await prisma.exam.findFirst({
    where: { id, teacherId: profile.id },
    include: {
      department: true,
      subject: true,
    },
  })

  if (!exam) {
    return <div className="py-20 text-center text-gray-500">Exam not found or access denied.</div>
  }

  const [attempts, logs] = await Promise.all([
    prisma.studentExamAttempt.findMany({
      where: { examId: id },
      include: {
        student: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activityLog.findMany({
      where: { examId: id },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return <ExamSecurityLogView exam={exam} attempts={attempts} logs={logs} />
}
