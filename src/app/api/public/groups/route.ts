import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const academicYearId = searchParams.get('academicYearId')

  return NextResponse.json(
    await prisma.group.findMany({
      where: {
        isActive: true,
        ...(academicYearId ? { academicYearId } : {}),
      },
      select: { id: true, name: true, code: true, academicYearId: true },
      orderBy: { name: 'asc' },
    })
  )
}
