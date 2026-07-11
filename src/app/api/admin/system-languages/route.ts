import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { auth } from '@/lib/auth'
import { isPrismaKnownError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { systemLanguageSchema } from '@/lib/validators'

async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== UserRole.SUPER_ADMIN) return null
  return session
}

export async function GET() {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await prisma.systemLanguage.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }))
}

export async function POST(req: NextRequest) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = systemLanguageSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const existingCount = await prisma.systemLanguage.count()
    const payload = {
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      isDefault: existingCount === 0 ? true : parsed.data.isDefault ?? false,
    }

    const created = await prisma.$transaction(async (tx) => {
      if (payload.isDefault) {
        await tx.systemLanguage.updateMany({ data: { isDefault: false } })
      }

      return tx.systemLanguage.create({ data: payload })
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') return NextResponse.json({ error: 'Already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
