import { NextRequest, NextResponse } from 'next/server'
import { createPhase9Gradebook } from '@/lib/phase9-results'
import { prisma } from '@/lib/prisma'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'
import { phase9GradebookCreateSchema } from '@/lib/phase9-validators'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')?.trim() ?? undefined
  const access = await requirePhase9Permission('analytics.read', { departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const gradebooks = await prisma.phase9Gradebook.findMany({
    where: departmentId ? { departmentId } : undefined,
    include: {
      academicOffering: {
        include: {
          subject: true,
        },
      },
      components: {
        orderBy: { sortOrder: 'asc' },
      },
      resultRecords: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(gradebooks)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = phase9GradebookCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const access = await requirePhase9Permission('gradebook.manage', {
    departmentId: parsed.data.departmentId,
    academicOfferingId: parsed.data.academicOfferingId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const gradebook = await createPhase9Gradebook(parsed.data)
  return NextResponse.json(gradebook, { status: 201 })
}
