import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { listStudentPhase10Courses } from '@/lib/phase10-lms'
import { UserRole } from '@prisma/client'

export default async function StudentLmsPage() {
  const session = await requireRole(UserRole.STUDENT)
  const payload = await listStudentPhase10Courses(session.user.id)

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Learning Management</h1>
        <p className="mt-2 text-sm text-slate-500">Track lessons, videos, live classes, and course progress from the Phase 10 LMS workspace.</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-3">
          {payload.courses.length === 0 ? (
            <p className="text-sm text-slate-500">No LMS courses are available yet.</p>
          ) : (
            payload.courses.map((course) => (
              <Link
                key={course.id}
                href={`/student/lms/${course.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:border-emerald-400 hover:bg-emerald-50"
              >
                <span>{course.title}</span>
                <span>{course.progressPercent}% complete</span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
