import { auth } from '@/lib/auth'
import {
  buildCourseworkTemplateVersionSnapshot,
  normalizeAllowedFileTypes,
} from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import {
  CourseworkLatePolicyType,
  CourseworkPenaltyType,
  CourseworkTemplateType,
  CourseworkVisibility,
  UserRole,
} from '@prisma/client'
import { NextResponse } from 'next/server'

function coerceEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  const normalized = String(value || '').trim().toUpperCase() as T
  return allowed.includes(normalized) ? normalized : fallback
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== UserRole.TEACHER && session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, departmentId: true },
  })

  const templates = await prisma.courseworkTemplate.findMany({
    where:
      session.user.role === UserRole.SUPER_ADMIN
        ? {}
        : session.user.role === UserRole.DEPARTMENT_ADMIN
          ? { department: { adminId: session.user.id } }
          : teacherProfile
            ? { teacherId: teacherProfile.id }
            : { id: '__no_match__' },
    include: {
      rubric: {
        include: {
          criteria: {
            include: {
              levels: {
                orderBy: { orderIndex: 'asc' },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
      subject: { select: { id: true, name: true } },
      language: { select: { id: true, name: true, code: true } },
      group: { select: { id: true, name: true, code: true } },
      academicYear: { select: { id: true, name: true, year: true } },
      semester: { select: { id: true, name: true, number: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ templates })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can create coursework templates' }, { status: 403 })
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, departmentId: true },
  })

  if (!teacherProfile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const body = await request.json()
  const subjectId = String(body.subjectId || '').trim()
  const languageId = String(body.languageId || '').trim()
  const groupId = String(body.groupId || '').trim()
  const academicYearId = String(body.academicYearId || '').trim()
  const semesterId = String(body.semesterId || '').trim()
  const academicOfferingId = String(body.academicOfferingId || '').trim() || null
  const title = String(body.title || '').trim()

  if (!subjectId || !languageId || !groupId || !academicYearId || !semesterId || title.length < 3) {
    return NextResponse.json({ error: 'Missing required template scope or title fields' }, { status: 400 })
  }

  const allowed = await teacherHasCourseworkPermission(
    { userId: session.user.id, role: session.user.role },
    'coursework.manage',
    { academicOfferingId, subjectId, languageId, groupId, academicYearId, semesterId }
  )
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission to manage coursework in this scope' }, { status: 403 })
  }

  const templateType = coerceEnumValue(
    body.type,
    Object.values(CourseworkTemplateType),
    CourseworkTemplateType.HOMEWORK
  )
  const visibility = coerceEnumValue(
    body.visibility,
    Object.values(CourseworkVisibility),
    CourseworkVisibility.COURSE
  )
  const latePolicyType = coerceEnumValue(
    body.latePolicyType,
    Object.values(CourseworkLatePolicyType),
    CourseworkLatePolicyType.NO_LATE_SUBMISSION
  )
  const latePenaltyType =
    body.latePenaltyType == null
      ? null
      : coerceEnumValue(body.latePenaltyType, Object.values(CourseworkPenaltyType), CourseworkPenaltyType.PERCENTAGE_DEDUCTION)

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.courseworkTemplate.create({
      data: {
        teacherId: teacherProfile.id,
        departmentId: teacherProfile.departmentId,
        subjectId,
        languageId,
        groupId,
        academicYearId,
        semesterId,
        academicOfferingId,
        type: templateType,
        visibility,
        title,
        description: typeof body.description === 'string' ? body.description.trim() : null,
        instructions: typeof body.instructions === 'string' ? body.instructions.trim() : null,
        allowedFileTypes: normalizeAllowedFileTypes(body.allowedFileTypes),
        maxFileSizeBytes: Math.max(1, Number(body.maxFileSizeBytes) || 10 * 1024 * 1024),
        maxAttempts: body.allowUnlimitedAttempts ? null : Math.max(1, Number(body.maxAttempts) || 1),
        allowUnlimitedAttempts: Boolean(body.allowUnlimitedAttempts),
        allowTextSubmission: body.allowTextSubmission !== false,
        allowRichTextSubmission: body.allowRichTextSubmission !== false,
        allowFileUpload: body.allowFileUpload !== false,
        allowExternalLink: body.allowExternalLink !== false,
        allowGitRepository: body.allowGitRepository !== false,
        dueDatePolicy: body.dueDatePolicy ?? null,
        latePolicyType,
        lateGraceMinutes: body.lateGraceMinutes == null ? null : Math.max(0, Number(body.lateGraceMinutes) || 0),
        latePenaltyType,
        latePenaltyValue: body.latePenaltyValue == null ? null : Math.max(0, Number(body.latePenaltyValue) || 0),
        extensionPolicy: body.extensionPolicy ?? null,
        reviewRequestsEnabled: Boolean(body.reviewRequestsEnabled),
        rubricTitle:
          body.rubric && typeof body.rubric.title === 'string'
            ? String(body.rubric.title).trim()
            : null,
      },
    })

    if (body.rubric && Array.isArray(body.rubric.criteria)) {
      await tx.courseworkRubric.create({
        data: {
          templateId: created.id,
          title: String(body.rubric.title || `${title} Rubric`).trim(),
          description: typeof body.rubric.description === 'string' ? body.rubric.description.trim() : null,
          totalMarks: (body.rubric.criteria as Array<{ maximumMarks?: number }>).reduce(
            (sum, criterion) => sum + Math.max(0, Number(criterion.maximumMarks) || 0),
            0
          ),
          criteria: {
            create: (body.rubric.criteria as Array<Record<string, unknown>>).map((criterion, index) => ({
              title: String(criterion.title || `Criterion ${index + 1}`).trim(),
              description: typeof criterion.description === 'string' ? criterion.description.trim() : null,
              maximumMarks: Math.max(0, Number(criterion.maximumMarks) || 0),
              weight: Math.max(0, Number(criterion.weight) || 1),
              feedbackHint: typeof criterion.feedbackHint === 'string' ? criterion.feedbackHint.trim() : null,
              orderIndex: index,
              levels: Array.isArray(criterion.levels)
                ? {
                    create: (criterion.levels as Array<Record<string, unknown>>).map((level, levelIndex) => ({
                      title: String(level.title || `Level ${levelIndex + 1}`).trim(),
                      description: typeof level.description === 'string' ? level.description.trim() : null,
                      score: Math.max(0, Number(level.score) || 0),
                      feedback: typeof level.feedback === 'string' ? level.feedback.trim() : null,
                      orderIndex: levelIndex,
                    })),
                  }
                : undefined,
            })),
          },
        },
      })
    }

    await tx.courseworkTemplateVersion.create({
      data: {
        templateId: created.id,
        versionNumber: 1,
        title: created.title,
        description: created.description,
        instructions: created.instructions,
        configuration: buildCourseworkTemplateVersionSnapshot(created),
        publishedById: teacherProfile.id,
      },
    })

    return created
  })

  return NextResponse.json({ template }, { status: 201 })
}
