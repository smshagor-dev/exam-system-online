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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.registrationField.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Field not found' }, { status: 404 })

  const body = await req.json()
  const parsed = registrationFieldSchema.safeParse({
    ...body,
    departmentId: existing.departmentId,
    sortOrder: Number(body.sortOrder ?? existing.sortOrder),
    isRequired: Boolean(body.isRequired),
    isActive: body.isActive !== false,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const options = parsed.data.type === 'SELECT'
    ? sanitizeRegistrationFieldOptions(parsed.data.options)
    : undefined

  try {
    const field = await prisma.registrationField.update({
      where: { id },
      data: {
        label: parsed.data.label,
        key: buildRegistrationFieldKey(parsed.data.label),
        type: parsed.data.type,
        isRequired: parsed.data.isRequired,
        isActive: parsed.data.isActive,
        placeholder: parsed.data.placeholder ?? null,
        sortOrder: parsed.data.sortOrder,
        options: options ?? null,
      },
    })

    return NextResponse.json(field)
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ error: 'A field with this label already exists for the department.' }, { status: 409 })
    }

    return NextResponse.json({ error: 'Failed to update registration field' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.registrationField.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Field not found' }, { status: 404 })

  await prisma.registrationField.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
