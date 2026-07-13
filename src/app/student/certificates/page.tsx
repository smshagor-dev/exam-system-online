import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

export default async function StudentCertificatesPage() {
  const session = await requireRole(UserRole.STUDENT)
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  const certificates = profile
    ? await prisma.phase9CertificateRecord.findMany({
        where: {
          studentId: profile.id,
          status: {
            not: 'REVOKED',
          },
        },
        orderBy: { issuedAt: 'desc' },
      })
    : []

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Certificates</h1>
        <p className="mt-2 text-sm text-slate-500">Download your issued Phase 9 certificates from the secure registry.</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-3">
          {certificates.length === 0 ? (
            <p className="text-sm text-slate-500">No certificates are available yet.</p>
          ) : (
            certificates.map((record) => (
              <Link
                key={record.id}
                href={`/api/student/certificates/${record.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:border-sky-400 hover:bg-sky-50"
              >
                <span>{record.certificateNumber}</span>
                <span>{record.type}</span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
