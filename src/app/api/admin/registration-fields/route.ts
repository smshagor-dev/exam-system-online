import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { registrationFieldSchema } from '@/lib/validators'
import { UserRole } from '@prisma/client'
import { buildRegistrationFieldKey, sanitizeRegistrationFieldOptions } from '@/lib/registration-fields'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role !== UserRole.SUPER_ADMIN) return null
  return session
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')

  const where = departmentId ? { departmentId } : undefined

  const fields = await prisma.registrationField.findMany({
    where,
    include: {
      department: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { departmentId: 'asc' },
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  return NextResponse.json(fields)
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = registrationFieldSchema.safeParse({
    ...body,
    sortOrder: Number(body.sortOrder ?? 0),
    isRequired: Boolean(body.isRequired),
    isActive: body.isActive !== false,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const key = buildRegistrationFieldKey(parsed.data.label)
  const options = parsed.data.type === 'SELECT'
    ? sanitizeRegistrationFieldOptions(parsed.data.options)
    : undefined

  try {
    const field = await prisma.registrationField.create({
      data: {
        departmentId: parsed.data.departmentId,
        label: parsed.data.label,
        key,
        type: parsed.data.type,
        isRequired: parsed.data.isRequired,
        isActive: parsed.data.isActive,
        placeholder: parsed.data.placeholder ?? null,
        sortOrder: parsed.data.sortOrder,
        options: options ?? null,
      },
    })

    return NextResponse.json(field, { status: 201 })
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ error: 'A field with this label already exists for the department.' }, { status: 409 })
    }

    return NextResponse.json({ error: 'Failed to create registration field' }, { status: 500 })
  }
}
