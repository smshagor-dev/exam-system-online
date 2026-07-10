import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isSupportedLocale, normalizeLocale } from '@/lib/i18n/locales'

async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== UserRole.SUPER_ADMIN) {
    return null
  }

  return session
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const locale = normalizeLocale(body.locale)
  const key = String(body.key ?? '').trim()
  const value = String(body.value ?? '').trim()

  if (!(await isSupportedLocale(locale))) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }

  if (!key || !value) {
    return NextResponse.json({ error: 'Key and value are required' }, { status: 400 })
  }

  try {
    const entry = await prisma.translationEntry.update({
      where: { id },
      data: {
        locale,
        key,
        value,
      },
    })

    return NextResponse.json(entry)
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'This locale/key pair already exists' }, { status: 409 })
    }

    return NextResponse.json({ error: 'Failed to update translation entry' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.translationEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
