import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  return NextResponse.json(
    await prisma.semester.findMany({
      where: { isActive: true },
      select: { id: true, name: true, number: true },
      orderBy: { number: 'asc' },
    })
  )
}
