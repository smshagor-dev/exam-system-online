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

export async function GET(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const locale = normalizeLocale(searchParams.get('locale'))
  const search = searchParams.get('search')?.trim()
  const localeIsValid = locale ? await isSupportedLocale(locale) : false

  const entries = await prisma.translationEntry.findMany({
    where: {
      ...(locale && localeIsValid ? { locale } : {}),
      ...(search ? { key: { contains: search } } : {}),
    },
    orderBy: [{ locale: 'asc' }, { key: 'asc' }],
  })

  return NextResponse.json(entries)
}

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
    const entry = await prisma.translationEntry.create({
      data: {
        locale,
        key,
        value,
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'This locale/key pair already exists' }, { status: 409 })
    }

    return NextResponse.json({ error: 'Failed to create translation entry' }, { status: 500 })
  }
}
