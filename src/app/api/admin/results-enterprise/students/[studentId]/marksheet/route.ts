import { NextRequest, NextResponse } from 'next/server'
import { generatePhase9Marksheet } from '@/lib/phase9-results'
import { prisma } from '@/lib/prisma'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'
import { phase9MarksheetRequestSchema } from '@/lib/phase9-validators'

type RouteContext = { params: Promise<{ studentId: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { studentId } = await params
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { departmentId: true },
  })
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const access = await requirePhase9Permission('transcript.generate', { departmentId: student.departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = phase9MarksheetRequestSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const result = await generatePhase9Marksheet(studentId, parsed.data.type, parsed.data.locale ?? 'en', access.session.user.id)
  return new NextResponse(result.buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="marksheet-${result.marksheet.id}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Phase9-Record-Id': result.marksheet.id,
      'X-Phase9-Verification-Code': result.marksheet.verificationCode,
    },
  })
}
