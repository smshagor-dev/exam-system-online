import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')
  const where: any = { isActive: true }
  if (departmentId) where.departmentId = departmentId
  const subjects = await prisma.subject.findMany({ where, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } })
  return NextResponse.json(subjects)
}
