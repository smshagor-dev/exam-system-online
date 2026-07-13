import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { phase9GradingScaleSchema, phase9ResultPolicySchema } from '@/lib/phase9-validators'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')?.trim() ?? undefined
  const access = await requirePhase9Permission('analytics.read', { departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const policies = await prisma.phase9ResultPolicy.findMany({
    where: departmentId ? { departmentId } : undefined,
    include: {
      gradingScale: {
        include: {
          bands: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(policies)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (body?.bands) {
    const parsed = phase9GradingScaleSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const access = await requirePhase9Permission('results.publish', { departmentId: parsed.data.departmentId })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const scale = await prisma.phase9GradingScale.create({
      data: {
        departmentId: parsed.data.departmentId,
        name: parsed.data.name,
        code: parsed.data.code,
        isDefault: parsed.data.isDefault ?? false,
        maximumGpa: parsed.data.maximumGpa ?? 4,
        passPercentage: parsed.data.passPercentage ?? 40,
        bands: {
          create: parsed.data.bands.map((band, index) => ({
            label: band.label,
            minPercentage: band.minPercentage,
            maxPercentage: band.maxPercentage,
            gradePoint: band.gradePoint,
            isPassing: band.isPassing ?? true,
            sortOrder: band.sortOrder ?? index,
          })),
        },
      },
      include: {
        bands: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    return NextResponse.json(scale, { status: 201 })
  }

  const parsed = phase9ResultPolicySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const access = await requirePhase9Permission('results.publish', { departmentId: parsed.data.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const policy = await prisma.phase9ResultPolicy.upsert({
    where: { departmentId: parsed.data.departmentId },
    create: parsed.data,
    update: parsed.data,
    include: {
      gradingScale: {
        include: {
          bands: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  })

  return NextResponse.json(policy, { status: 201 })
}
