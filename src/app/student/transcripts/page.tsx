import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

export default async function StudentTranscriptsPage() {
  const session = await requireRole(UserRole.STUDENT)
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  const transcripts = profile
    ? await prisma.phase9TranscriptRecord.findMany({
        where: {
          studentId: profile.id,
          status: {
            not: 'REVOKED',
          },
        },
        orderBy: { generatedAt: 'desc' },
      })
    : []

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Official Transcripts</h1>
        <p className="mt-2 text-sm text-slate-500">Download issued transcripts once the registrar or controller publishes them.</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-3">
          {transcripts.length === 0 ? (
            <p className="text-sm text-slate-500">No transcripts are available yet.</p>
          ) : (
            transcripts.map((record) => (
              <Link
                key={record.id}
                href={`/api/student/transcripts/${record.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:border-sky-400 hover:bg-sky-50"
              >
                <span>{record.verificationCode}</span>
                <span>{record.generatedAt.toISOString().slice(0, 10)}</span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
