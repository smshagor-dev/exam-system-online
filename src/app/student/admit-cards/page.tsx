import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function StudentAdmitCardsPage() {
  const session = await requireRole(UserRole.STUDENT)
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Student profile not configured. Contact admin.</div>
  }

  const cards = await prisma.examAdmitCard.findMany({
    where: {
      studentId: profile.id,
      revokedAt: null,
    },
    include: {
      schedulingSession: true,
    },
    orderBy: { issuedAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admit Cards</h1>
        <p className="mt-1 text-gray-500">Download your generated admit cards once an examination schedule is published.</p>
      </div>

      <div className="grid gap-4">
        {cards.map((card) => (
          <div key={card.id} className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{card.schedulingSession.name}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {card.schedulingSession.type} · issued {card.issuedAt.toLocaleString()}
                </p>
              </div>
              <Link
                href={`/api/student/admit-cards/${card.id}`}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Open Admit Card
              </Link>
            </div>
          </div>
        ))}
        {cards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
            No admit cards are available yet.
          </div>
        )}
      </div>
    </div>
  )
}
