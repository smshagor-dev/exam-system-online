import { auth } from '@/lib/auth'
import {
  createCourseworkActivityLog,
  createCourseworkNotification,
  normalizeAllowedFileTypes,
} from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import {
  CourseworkAudienceType,
  CourseworkPublicationStatus,
  UserRole,
} from '@prisma/client'
import { NextResponse } from 'next/server'

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
    select: { id: true },
  })

  const publications = await prisma.courseworkPublication.findMany({
    where:
      session.user.role === UserRole.SUPER_ADMIN
        ? {}
        : session.user.role === UserRole.DEPARTMENT_ADMIN
          ? { department: { adminId: session.user.id } }
          : teacherProfile
            ? { teacherId: teacherProfile.id }
            : { id: '__no_match__' },
    include: {
      template: { select: { id: true, title: true, type: true } },
      subject: { select: { id: true, name: true } },
      language: { select: { id: true, name: true, code: true } },
      group: { select: { id: true, name: true, code: true } },
      targets: {
        include: {
          student: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
          },
        },
      },
      _count: {
        select: {
          attempts: true,
          extensionRequests: true,
          grades: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ publications })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can publish coursework' }, { status: 403 })
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!teacherProfile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const body = await request.json()
  const templateId = String(body.templateId || '').trim()
  if (!templateId) {
    return NextResponse.json({ error: 'Template is required' }, { status: 400 })
  }

  const template = await prisma.courseworkTemplate.findUnique({
    where: { id: templateId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
      rubric: true,
    },
  })

  if (!template) {
    return NextResponse.json({ error: 'Coursework template not found' }, { status: 404 })
  }

  const canPublish = await teacherHasCourseworkPermission(
    { userId: session.user.id, role: session.user.role },
    'coursework.publish',
    {
      academicOfferingId: template.academicOfferingId,
      subjectId: template.subjectId,
      languageId: template.languageId,
      groupId: template.groupId ?? '',
      academicYearId: template.academicYearId ?? '',
      semesterId: template.semesterId ?? '',
    }
  )
  if (!canPublish) {
    return NextResponse.json({ error: 'You do not have permission to publish coursework in this scope' }, { status: 403 })
  }

  const audienceType = Object.values(CourseworkAudienceType).includes(body.audienceType)
    ? body.audienceType
    : CourseworkAudienceType.SCOPE
  const requestedStatus = Object.values(CourseworkPublicationStatus).includes(body.status)
    ? body.status
    : CourseworkPublicationStatus.DRAFT
  const targetStudentIds: string[] = Array.isArray(body.targetStudentIds)
    ? Array.from(new Set(body.targetStudentIds.map((value: unknown) => String(value || '').trim()).filter(Boolean)))
    : []

  const publication = await prisma.$transaction(async (tx) => {
    const created = await tx.courseworkPublication.create({
      data: {
        templateId: template.id,
        templateVersionId: template.versions[0]?.id ?? null,
        teacherId: teacherProfile.id,
        departmentId: template.departmentId,
        subjectId: template.subjectId,
        languageId: template.languageId,
        groupId: template.groupId!,
        academicYearId: template.academicYearId!,
        semesterId: template.semesterId!,
        academicOfferingId: template.academicOfferingId,
        audienceType,
        status: requestedStatus,
        title: String(body.title || template.title).trim(),
        description: typeof body.description === 'string' ? body.description.trim() : template.description,
        instructions: typeof body.instructions === 'string' ? body.instructions.trim() : template.instructions,
        versionNumber: Number(body.versionNumber) > 0 ? Number(body.versionNumber) : 1,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        publishedAt: requestedStatus === CourseworkPublicationStatus.PUBLISHED ? new Date() : null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        hardCloseAt: body.hardCloseAt ? new Date(body.hardCloseAt) : null,
        allowedFileTypes: normalizeAllowedFileTypes(body.allowedFileTypes ?? template.allowedFileTypes),
        maxFileSizeBytes: Math.max(1, Number(body.maxFileSizeBytes) || template.maxFileSizeBytes),
        maxAttempts: template.allowUnlimitedAttempts ? null : Math.max(1, Number(body.maxAttempts) || template.maxAttempts || 1),
        allowUnlimitedAttempts: body.allowUnlimitedAttempts == null ? template.allowUnlimitedAttempts : Boolean(body.allowUnlimitedAttempts),
        allowTextSubmission: body.allowTextSubmission == null ? template.allowTextSubmission : Boolean(body.allowTextSubmission),
        allowRichTextSubmission: body.allowRichTextSubmission == null ? template.allowRichTextSubmission : Boolean(body.allowRichTextSubmission),
        allowFileUpload: body.allowFileUpload == null ? template.allowFileUpload : Boolean(body.allowFileUpload),
        allowExternalLink: body.allowExternalLink == null ? template.allowExternalLink : Boolean(body.allowExternalLink),
        allowGitRepository: body.allowGitRepository == null ? template.allowGitRepository : Boolean(body.allowGitRepository),
        latePolicyType: body.latePolicyType ?? template.latePolicyType,
        lateGraceMinutes:
          body.lateGraceMinutes == null
            ? template.lateGraceMinutes
            : Math.max(0, Number(body.lateGraceMinutes) || 0),
        latePenaltyType: body.latePenaltyType ?? template.latePenaltyType,
        latePenaltyValue:
          body.latePenaltyValue == null
            ? template.latePenaltyValue
            : Math.max(0, Number(body.latePenaltyValue) || 0),
        extensionEnabled: body.extensionEnabled == null ? true : Boolean(body.extensionEnabled),
        reviewRequestsEnabled:
          body.reviewRequestsEnabled == null ? template.reviewRequestsEnabled : Boolean(body.reviewRequestsEnabled),
        groupAssignmentEnabled: Boolean(body.groupAssignmentEnabled),
        rubricId: template.rubric?.id ?? null,
        metadata: body.metadata ?? null,
      },
    })

    if (targetStudentIds.length > 0) {
      await tx.courseworkPublicationTarget.createMany({
        data: targetStudentIds.map((studentId: string) => ({
          publicationId: created.id,
          studentId,
        })),
      })
    }

    return created
  })

  if (publication.status === CourseworkPublicationStatus.PUBLISHED) {
    const targetStudents =
      targetStudentIds.length > 0
        ? await prisma.studentProfile.findMany({
            where: {
              id: { in: targetStudentIds },
            },
            select: { userId: true },
          })
        : await prisma.studentProfile.findMany({
            where: {
              departmentId: publication.departmentId,
              subjects: {
                some: publication.academicOfferingId
                  ? {
                      OR: [
                        { academicOfferingId: publication.academicOfferingId },
                        {
                          subjectId: publication.subjectId,
                          languageId: publication.languageId,
                          groupId: publication.groupId,
                          academicYearId: publication.academicYearId,
                          semesterId: publication.semesterId,
                        },
                      ],
                    }
                  : {
                      subjectId: publication.subjectId,
                      languageId: publication.languageId,
                      groupId: publication.groupId,
                      academicYearId: publication.academicYearId,
                      semesterId: publication.semesterId,
                    },
              },
            },
            select: { userId: true },
          })

    await Promise.all(
      targetStudents.map((student) =>
        createCourseworkNotification({
          userId: student.userId,
          title: 'Coursework published',
          message: `A new coursework assignment is available: ${publication.title}`,
          link: '/student/coursework',
          dedupeWindowMs: 60_000,
        })
      )
    )
  }

  await createCourseworkActivityLog({
    userId: session.user.id,
    action: 'coursework.publication.create',
    details: JSON.stringify({ publicationId: publication.id, templateId: publication.templateId, status: publication.status }),
  })

  return NextResponse.json({ publication }, { status: 201 })
}
