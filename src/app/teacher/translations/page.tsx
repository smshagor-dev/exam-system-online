import TeacherTranslationWorkspace, {
  type TranslationWorkspaceItemSummary,
} from '@/components/teacher/TeacherTranslationWorkspace'
import { requireRole } from '@/lib/auth'
import { getEntityList, getSupportedDepartmentLanguages } from '@/lib/phase5-translations'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function TeacherTranslationsPage() {
  const session = await requireRole(UserRole.TEACHER)

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      departmentId: true,
    },
  })

  if (!teacherProfile) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  const [departmentLanguages, initialItems] = await Promise.all([
    getSupportedDepartmentLanguages(teacherProfile.departmentId),
    getEntityList(
      { userId: session.user.id, role: session.user.role },
      'questions',
      {}
    ),
  ])

  return (
    <TeacherTranslationWorkspace
      languages={departmentLanguages.map((entry) => ({
        id: entry.languageId,
        name: entry.language.name,
        code: entry.language.code,
      }))}
      initialEntity="questions"
      initialItems={initialItems as TranslationWorkspaceItemSummary[]}
    />
  )
}
