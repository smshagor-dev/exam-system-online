import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTeacherProfileByUserId } from '@/lib/teacher-assignment'
import { UserRole } from '@prisma/client'

export default async function TeacherLmsPage() {
  const session = await requireRole(UserRole.TEACHER)
  const teacher = await getTeacherProfileByUserId(session.user.id)

  const courses = teacher
    ? await prisma.phase10Course.findMany({
        where: {
          departmentId: teacher.departmentId,
        },
        include: {
          subject: true,
          lessons: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
      })
    : []

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">LMS Teaching Workspace</h1>
        <p className="mt-2 text-sm text-slate-500">
          Review LMS course delivery, lesson publication, and student discussion activity for your department scope.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-3">
          {courses.length === 0 ? (
            <p className="text-sm text-slate-500">No LMS courses are available yet.</p>
          ) : (
            courses.map((course) => (
              <div key={course.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="font-medium text-slate-900">{course.title}</p>
                <p className="text-sm text-slate-500">
                  {course.subject.name} | {course.lessons.length} lessons | {course.status}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
