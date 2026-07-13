import { requireRole } from '@/lib/auth'
import { getStudentEnterpriseCourseworkWorkspace } from '@/lib/coursework-enterprise-workspace'
import { UserRole } from '@prisma/client'

export default async function StudentCourseworkExtensionsPage() {
  const session = await requireRole(UserRole.STUDENT)
  const workspace = await getStudentEnterpriseCourseworkWorkspace(session.user.id)

  if (!workspace) {
    return <div className="py-20 text-center text-gray-500">Student profile not configured. Contact admin.</div>
  }

  const rows = workspace.publications.flatMap((publication) =>
    publication.extensionRequests.map((request) => ({
      ...request,
      publicationId: publication.id,
      title: publication.title,
    }))
  )

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Coursework Extensions</h1>
        <p className="mt-1 text-sm text-slate-500">Track pending, approved, rejected, cancelled, and expired extension requests.</p>
      </section>
      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No extension requests yet.
        </div>
      ) : null}
      <div className="space-y-4">
        {rows.map((row) => (
          <section key={row.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{row.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Requested: {row.requestedUntil ? new Date(row.requestedUntil).toLocaleString() : 'n/a'}
                </p>
                {row.approvedUntil ? <p className="mt-1 text-xs text-slate-400">Approved until: {new Date(row.approvedUntil).toLocaleString()}</p> : null}
                {row.teacherNote ? <p className="mt-2 text-sm text-slate-600">Teacher note: {row.teacherNote}</p> : null}
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{row.status}</span>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
