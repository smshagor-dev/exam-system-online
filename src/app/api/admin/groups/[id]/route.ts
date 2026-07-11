import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, isPrismaKnownError } from '@/lib/api-errors'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { validateGroupAcademicContext } from '@/lib/academic-scope'
import { prisma } from '@/lib/prisma'
import { groupSchema } from '@/lib/validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const existing = await prisma.group.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    if (!existing.departmentId || !canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = groupSchema.partial().safeParse({
      ...body,
      isActive: body.isActive ?? undefined,
    })
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const nextData = {
      academicYearId: parsed.data.academicYearId ?? existing.academicYearId,
      departmentId: parsed.data.departmentId ?? existing.departmentId,
      programId: parsed.data.programId ?? existing.programId,
      languageId: parsed.data.languageId ?? existing.languageId,
      departmentLanguageId: parsed.data.departmentLanguageId ?? existing.departmentLanguageId,
      academicSessionId: parsed.data.academicSessionId ?? existing.academicSessionId,
      programYearId: parsed.data.programYearId ?? existing.programYearId,
      currentProgramSemesterId: parsed.data.currentProgramSemesterId ?? existing.currentProgramSemesterId,
    }
    const hasContextChanges = [
      'academicYearId',
      'departmentId',
      'programId',
      'languageId',
      'departmentLanguageId',
      'academicSessionId',
      'programYearId',
      'currentProgramSemesterId',
    ].some((key) => parsed.data[key as keyof typeof parsed.data] !== undefined && parsed.data[key as keyof typeof parsed.data] !== existing[key as keyof typeof existing])

    if (hasContextChanges) {
      const relatedOfferingCount = await prisma.academicOffering.count({ where: { groupId: id, isActive: true } })
      if (relatedOfferingCount > 0) {
        return NextResponse.json({ error: 'Cannot change normalized group context while active offerings exist' }, { status: 409 })
      }
    }

    if (
      !nextData.academicYearId ||
      !nextData.departmentId ||
      !nextData.programId ||
      !nextData.languageId ||
      !nextData.academicSessionId ||
      !nextData.programYearId
    ) {
      return NextResponse.json({ error: 'Normalized group context is incomplete' }, { status: 400 })
    }

    await validateGroupAcademicContext({
      academicYearId: nextData.academicYearId,
      departmentId: nextData.departmentId,
      programId: nextData.programId,
      languageId: nextData.languageId,
      departmentLanguageId: nextData.departmentLanguageId,
      academicSessionId: nextData.academicSessionId,
      programYearId: nextData.programYearId,
      currentProgramSemesterId: nextData.currentProgramSemesterId,
    }, prisma)

    return NextResponse.json(await prisma.group.update({ where: { id }, data: parsed.data }))
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Update failed') }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const scope = await getAdminScope()
    const existing = await prisma.group.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    if (!existing.departmentId || !canAccessDepartment(scope, existing.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const activeOfferings = await prisma.academicOffering.count({ where: { groupId: id, isActive: true } })
    if (activeOfferings > 0) {
      return NextResponse.json({ error: 'Cannot archive group with active offerings' }, { status: 409 })
    }

    await prisma.group.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (isPrismaKnownError(error) && error.code === 'P2003') return NextResponse.json({ error: 'Has related data' }, { status: 409 })
    return NextResponse.json({ error: getErrorMessage(error, 'Delete failed') }, { status: 500 })
  }
}
