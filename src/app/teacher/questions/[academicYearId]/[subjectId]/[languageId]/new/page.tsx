import { notFound } from 'next/navigation'
import { UserRole } from '@prisma/client'
import QuestionCreateForm from '../../../../QuestionCreateForm'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type PageProps = {
  params: Promise<{
    academicYearId: string
    subjectId: string
    languageId: string
  }>
}

export default async function NewQuestionPage({ params }: PageProps) {
  const session = await requireRole(UserRole.TEACHER)
  const { academicYearId, subjectId, languageId } = await params

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      assignments: {
        where: {
          academicYearId,
          subjectId,
          languageId,
        },
        include: {
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!profile || profile.assignments.length === 0) {
    notFound()
  }

  profile.assignments.sort((a, b) => {
    if (a.semester.number !== b.semester.number) {
      return a.semester.number - b.semester.number
    }

    return a.group.name.localeCompare(b.group.name)
  })

  return (
    <QuestionCreateForm
      assignments={profile.assignments}
      backHref={`/teacher/questions/${academicYearId}/${subjectId}/${languageId}`}
    />
  )
}
