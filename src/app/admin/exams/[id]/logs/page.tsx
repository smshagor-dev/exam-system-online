import ExamSecurityLogView from '@/components/exams/ExamSecurityLogView'
import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'

type Props = {
  params: Promise<{ id: string }>
}

export default async function AdminExamLogsPage({ params }: Props) {
  const scope = await getAdminScope()
  const { id } = await params

  const exam = await prisma.exam.findFirst({
    where: scope.isSuperAdmin ? { id } : { id, departmentId: { in: scope.managedDepartmentIds } },
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
