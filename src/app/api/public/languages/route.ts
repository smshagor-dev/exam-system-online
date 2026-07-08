import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export async function GET() {
  return NextResponse.json(await prisma.language.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }))
}
