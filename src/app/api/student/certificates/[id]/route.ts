import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })

  const certificate = await prisma.phase9CertificateRecord.findUnique({
    where: { id },
  })
  if (!certificate || certificate.studentId !== profile.id) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
  }
  if (certificate.status === 'REVOKED') {
    return NextResponse.json({ error: 'Certificate is revoked' }, { status: 403 })
  }

  const buffer = await fs.readFile(certificate.filePath)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${certificate.id}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
