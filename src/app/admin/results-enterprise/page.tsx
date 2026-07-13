import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'

export default async function ResultsEnterprisePage() {
  const scope = await getAdminScope()
  const where = scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } }

  const [gradebooks, results, appeals, certificates] = await Promise.all([
    prisma.phase9Gradebook.findMany({
      where,
      include: {
        academicOffering: {
          include: {
            subject: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.phase9ResultRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.phase9ResultAppeal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.phase9CertificateRecord.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: 8,
    }),
  ])

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Phase 9</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Enterprise Results Platform</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          Gradebooks, GPA and CGPA workflows, transcripts, certificates, graduation audit, appeals, and analytics are managed through the Phase 9 APIs.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Gradebooks</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{gradebooks.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Results</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{results.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Appeals</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{appeals.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Certificates</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{certificates.length}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Recent Gradebooks</h2>
        <div className="mt-4 space-y-3">
          {gradebooks.length === 0 ? (
            <p className="text-sm text-slate-500">No Phase 9 gradebooks exist yet.</p>
          ) : (
            gradebooks.map((gradebook) => (
              <div key={gradebook.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="font-medium text-slate-900">{gradebook.title}</p>
                <p className="text-sm text-slate-500">
                  {gradebook.academicOffering.subject.name} · {gradebook.status}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
