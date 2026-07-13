import { requireRole } from '@/lib/auth'
import { getStudentPhase10CourseDetail } from '@/lib/phase10-lms'
import { UserRole } from '@prisma/client'

type PageProps = { params: Promise<{ id: string }> }

export default async function StudentLmsCoursePage({ params }: PageProps) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const course = await getStudentPhase10CourseDetail(id, session.user.id)

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">{course.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{course.summary || 'Course overview and lesson progress.'}</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-4">
          {course.lessons.map((lesson) => (
            <div key={lesson.id} className="rounded-2xl border border-slate-200 p-4">
              <p className="font-medium text-slate-900">{lesson.title}</p>
              <p className="mt-1 text-sm text-slate-500">{lesson.summary || lesson.type}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{lesson.materials.length} materials</span>
                <span>{lesson.videoAssets.length} videos</span>
                <span>{lesson.liveClasses.length} live classes</span>
                <span>{lesson.discussionThreads.length} threads</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
