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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const parsed = systemLanguageSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const existing = await prisma.systemLanguage.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const payload = {
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      isDefault: parsed.data.isDefault ?? false,
    }

    if (existing.isDefault && !payload.isDefault) {
      return NextResponse.json({ error: 'A default system language is required' }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (payload.isDefault) {
        await tx.systemLanguage.updateMany({ data: { isDefault: false } })
      }

      return tx.systemLanguage.update({ where: { id }, data: payload })
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2002') return NextResponse.json({ error: 'Already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.systemLanguage.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.code.toUpperCase() === 'EN') {
    return NextResponse.json({ error: 'English cannot be deleted' }, { status: 400 })
  }
  if (existing.isDefault) {
    return NextResponse.json({ error: 'Default system language cannot be deleted' }, { status: 400 })
  }
  await prisma.systemLanguage.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
