import { NextRequest, NextResponse } from 'next/server'
import { createPhase9Appeal } from '@/lib/phase9-results'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { phase9AppealCreateSchema } from '@/lib/phase9-validators'

export async function GET() {
  const session = await requireRole(UserRole.STUDENT)
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })

  const appeals = await prisma.phase9ResultAppeal.findMany({
    where: { studentId: profile.id },
    include: {
      resultRecord: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(appeals)
}

export async function POST(req: NextRequest) {
  const session = await requireRole(UserRole.STUDENT)
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })

  const parsed = phase9AppealCreateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const record = await prisma.phase9ResultRecord.findUnique({
    where: { id: parsed.data.resultRecordId },
    select: { studentId: true, departmentId: true },
  })
  if (!record || record.studentId !== profile.id) {
    return NextResponse.json({ error: 'Result record not found for this student' }, { status: 404 })
  }

  const appeal = await createPhase9Appeal({
    resultRecordId: parsed.data.resultRecordId,
    studentId: profile.id,
    departmentId: record.departmentId,
    teacherId: parsed.data.teacherId ?? null,
    reason: parsed.data.reason,
  })

  return NextResponse.json(appeal, { status: 201 })
}
