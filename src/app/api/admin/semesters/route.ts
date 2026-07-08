import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { semesterSchema } from '@/lib/validators'
import { UserRole } from '@prisma/client'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role !== UserRole.SUPER_ADMIN) return null
  return session
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await prisma.semester.findMany({ orderBy: { number: 'asc' } }))
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const parsed = semesterSchema.safeParse({ ...body, number: parseInt(body.number) })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  try {
    return NextResponse.json(await prisma.semester.create({ data: parsed.data }), { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') return NextResponse.json({ error: 'Already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
