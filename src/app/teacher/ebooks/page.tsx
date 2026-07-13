import TeacherEbookManager from '@/components/teacher/TeacherEbookManager'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function TeacherEbooksPage() {
  const session = await requireRole(UserRole.TEACHER)

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      assignments: {
        include: {
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
        orderBy: [
          { academicYear: { year: 'asc' } },
          { semester: { number: 'asc' } },
          { subject: { name: 'asc' } },
        ],
      },
      ebookUploads: {
        include: {
          translations: true,
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
    <TeacherEbookManager
      assignments={profile.assignments.map((assignment) => ({
        id: assignment.id,
        subjectName: assignment.subject.name,
        languageName: assignment.language.name,
        groupName: assignment.group.name,
        academicYearName: assignment.academicYear.name,
        semesterName: assignment.semester.name,
      }))}
      initialUploads={profile.ebookUploads.map((ebook) => ({
        id: ebook.id,
        title: ebook.title,
        description: ebook.description,
        author: ebook.author,
        category: ebook.category,
        fileUrl: ebook.fileUrl,
        fileSizeBytes: ebook.fileSizeBytes,
        createdAt: ebook.createdAt.toISOString(),
        subjectName: ebook.subject.name,
        languageName: ebook.language.name,
        groupName: ebook.group.name,
        academicYearName: ebook.academicYear.name,
        semesterName: ebook.semester.name,
      }))}
    />
  )
}
