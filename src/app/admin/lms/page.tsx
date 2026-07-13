import { prisma } from '@/lib/prisma'

export default async function AdminLmsPage() {
  const [courses, lessons, liveClasses, threads] = await Promise.all([
    prisma.phase10Course.count(),
    prisma.phase10Lesson.count(),
    prisma.phase10LiveClass.count(),
    prisma.phase10DiscussionThread.count(),
  ])

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">Phase 10</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Enterprise LMS</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          Course management, learning materials, video progress, live classes, discussions, and LMS progress are managed through the Phase 10 APIs.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Courses</p><p className="mt-2 text-2xl font-semibold text-slate-900">{courses}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Lessons</p><p className="mt-2 text-2xl font-semibold text-slate-900">{lessons}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Live Classes</p><p className="mt-2 text-2xl font-semibold text-slate-900">{liveClasses}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Discussions</p><p className="mt-2 text-2xl font-semibold text-slate-900">{threads}</p></div>
        </div>
      </section>
    </div>
  )
}
