import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export async function GET() {
  return NextResponse.json(await prisma.academicYear.findMany({ where: { isActive: true }, select: { id: true, name: true, year: true }, orderBy: { year: 'asc' } }))
}
