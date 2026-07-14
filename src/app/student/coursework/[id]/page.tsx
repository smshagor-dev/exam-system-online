import RichTextContent from '@/components/editor/RichTextContent'
import { requireRole } from '@/lib/auth'
import { getStudentCourseworkPublicationWorkspace } from '@/lib/coursework-enterprise-workspace'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function StudentCourseworkDetailPage({ params }: PageProps) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const workspace = await getStudentCourseworkPublicationWorkspace(session.user.id, id)
  const publication = workspace?.publication

  if (!publication) {
    return <div className="py-20 text-center text-gray-500">Coursework not found or not available to you.</div>
  }

  const latestAttempt = publication.attempts[0] ?? null

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{publication.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {publication.subjectName} | {publication.languageName} | {publication.groupName}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Due {publication.dueAt ? new Date(publication.dueAt).toLocaleString() : 'not set'} | Hard close {publication.hardCloseAt ? new Date(publication.hardCloseAt).toLocaleString() : 'not set'}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{publication.status}</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-700">{publication.description || 'No description provided.'}</p>
        {publication.instructions ? <RichTextContent html={publication.instructions} className="rich-text-content mt-4 text-slate-800" /> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Attempts used</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{publication.attempts.length}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Latest attempt</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{latestAttempt ? latestAttempt.status : 'None'}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Latest grade</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{latestAttempt?.latestGrade ? `${latestAttempt.latestGrade.percentage.toFixed(0)}%` : 'N/A'}</p>
        </div>
      </section>

      {publication.aiReviewPolicy ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">AI Review Rules</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {publication.aiReviewPolicy.minWords ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">Minimum words: {publication.aiReviewPolicy.minWords}</div> : null}
            {publication.aiReviewPolicy.maxWords ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">Maximum words: {publication.aiReviewPolicy.maxWords}</div> : null}
            {publication.aiReviewPolicy.minimumReferenceCount ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">Minimum references: {publication.aiReviewPolicy.minimumReferenceCount}</div> : null}
            {publication.aiReviewPolicy.citationStyle ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">Citation style: {publication.aiReviewPolicy.citationStyle}</div> : null}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Every submitted document is analyzed automatically, but AI does not approve or reject coursework. Only your teacher makes the final academic decision.
          </p>
        </section>
      ) : null}

      {publication.rubric ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">{publication.rubric.title}</h2>
          <div className="mt-4 space-y-4">
            {publication.rubric.criteria.map((criterion) => (
              <div key={criterion.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{criterion.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{criterion.description || 'No description'}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {criterion.maximumMarks} marks
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href={`/student/coursework/${publication.id}/submit`} className="rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white">Submit attempt</Link>
        <Link href={`/student/coursework/${publication.id}/history`} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">View history</Link>
      </div>
    </div>
  )
}
