import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CourseworkGradeStatus, CourseworkPublicationStatus, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Only students can view coursework publications' }, { status: 403 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive || dbUser.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can view coursework publications' }, { status: 403 })
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      departmentId: true,
      subjects: {
        select: {
          subjectId: true,
          languageId: true,
          groupId: true,
          academicYearId: true,
          semesterId: true,
          academicOfferingId: true,
        },
      },
    },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })
  }

  const scopeClauses = profile.subjects.map((subject) => ({
    departmentId: profile.departmentId,
    OR: subject.academicOfferingId
      ? [
          { academicOfferingId: subject.academicOfferingId },
          {
            subjectId: subject.subjectId,
            languageId: subject.languageId,
            groupId: subject.groupId,
            academicYearId: subject.academicYearId,
            semesterId: subject.semesterId,
          },
        ]
      : [
          {
            subjectId: subject.subjectId,
            languageId: subject.languageId,
            groupId: subject.groupId,
            academicYearId: subject.academicYearId,
            semesterId: subject.semesterId,
          },
        ],
  }))

  const publications = await prisma.courseworkPublication.findMany({
    where: {
      status: {
        in: [CourseworkPublicationStatus.PUBLISHED, CourseworkPublicationStatus.CLOSED],
      },
      OR: [
        { targets: { some: { studentId: profile.id } } },
        ...(scopeClauses.length > 0 ? scopeClauses : [{ id: '__no_match__' }]),
      ],
    },
    include: {
      template: {
        select: {
          id: true,
          type: true,
          visibility: true,
        },
      },
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
      attempts: {
        where: { studentId: profile.id },
        include: {
          attachments: true,
          grades: {
            where: {
              status: CourseworkGradeStatus.PUBLISHED,
            },
            include: {
              criterionScores: true,
              feedbackAttachments: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { attemptNumber: 'desc' },
      },
      extensionRequests: {
        where: { studentId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ publications })
}
