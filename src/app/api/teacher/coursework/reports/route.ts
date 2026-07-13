import { auth } from '@/lib/auth'
import { teacherHasCourseworkPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

function toCsvRow(values: Array<string | number | null | undefined>) {
  return values
    .map((value) => {
      const normalized = String(value ?? '')
      const escaped = normalized.replaceAll('"', '""')
      return `"${escaped}"`
    })
    .join(',')
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can access coursework reports' }, { status: 403 })
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacherProfile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const format = url.searchParams.get('format') ?? 'json'
  const type = url.searchParams.get('type') ?? 'summary'
  const publicationId = url.searchParams.get('publicationId')

  let scopedPublicationIds: string[] | null = null
  if (publicationId) {
    const publication = await prisma.courseworkPublication.findUnique({
      where: { id: publicationId },
      select: {
        id: true,
        academicOfferingId: true,
        subjectId: true,
        languageId: true,
        groupId: true,
        academicYearId: true,
        semesterId: true,
      },
    })
    if (!publication) {
      return NextResponse.json({ error: 'Coursework publication not found' }, { status: 404 })
    }

    const allowed = await teacherHasCourseworkPermission(
      { userId: session.user.id, role: session.user.role },
      'coursework.report',
      publication
    )
    if (!allowed) {
      return NextResponse.json({ error: 'You do not have permission to access this coursework report' }, { status: 403 })
    }

    scopedPublicationIds = [publicationId]
  }

  const where = scopedPublicationIds ? { publicationId: { in: scopedPublicationIds } } : undefined

  const [publications, attempts, grades, extensions] = await Promise.all([
    prisma.courseworkPublication.findMany({
      where: scopedPublicationIds ? { id: { in: scopedPublicationIds } } : { teacherId: teacherProfile.id },
      include: {
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
        _count: {
          select: {
            attempts: true,
            grades: true,
            extensionRequests: true,
            targets: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.courseworkAttempt.findMany({
      where: {
        ...(where ?? {}),
        publication: scopedPublicationIds ? undefined : { teacherId: teacherProfile.id },
      },
      include: {
        publication: {
          include: {
            subject: true,
            group: true,
          },
        },
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.courseworkGrade.findMany({
      where: {
        ...(where ?? {}),
        publication: scopedPublicationIds ? undefined : { teacherId: teacherProfile.id },
      },
      include: {
        publication: {
          select: {
            title: true,
          },
        },
        attempt: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.courseworkExtensionRequest.findMany({
      where: {
        ...(where ?? {}),
        publication: scopedPublicationIds ? undefined : { teacherId: teacherProfile.id },
      },
      include: {
        publication: {
          select: {
            title: true,
          },
        },
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
  ])

  const summary = {
    publicationCount: publications.length,
    submittedCount: attempts.filter((attempt) => attempt.status === 'SUBMITTED').length,
    draftCount: attempts.filter((attempt) => attempt.status === 'DRAFT').length,
    lateCount: attempts.filter((attempt) => attempt.isLate).length,
    gradedCount: grades.length,
    publishedGradeCount: grades.filter((grade) => grade.status === 'PUBLISHED').length,
    extensionRequestCount: extensions.length,
    extensionApprovedCount: extensions.filter((extension) => extension.status === 'APPROVED').length,
    averageGradePercentage:
      grades.length > 0 ? grades.reduce((sum, grade) => sum + grade.percentage, 0) / grades.length : 0,
    averageGradingTurnaroundHours:
      grades.length > 0
        ? grades.reduce((sum, grade) => {
            const submittedAt = grade.attempt.submittedAt?.getTime()
            const publishedAt = grade.publishedAt?.getTime()
            if (!submittedAt || !publishedAt) {
              return sum
            }
            return sum + (publishedAt - submittedAt) / (1000 * 60 * 60)
          }, 0) / grades.length
        : 0,
  }

  if (format === 'csv') {
    let rows: string[] = []
    let fileName = 'coursework-report.csv'

    if (type === 'missing') {
      fileName = 'missing-students-report.csv'
      rows = [
        toCsvRow(['Publication', 'Target count', 'Attempt count', 'Missing count']),
        ...publications.map((publication) =>
          toCsvRow([
            publication.title,
            publication._count.targets,
            publication._count.attempts,
            Math.max(0, publication._count.targets - publication._count.attempts),
          ])
        ),
      ]
    } else if (type === 'grades') {
      fileName = 'grades-report.csv'
      rows = [
        toCsvRow(['Publication', 'Student', 'Email', 'Status', 'Score', 'Percentage']),
        ...grades.map((grade) =>
          toCsvRow([
            grade.publication.title,
            grade.attempt.student.user.name,
            grade.attempt.student.user.email,
            grade.status,
            grade.totalScore,
            grade.percentage.toFixed(2),
          ])
        ),
      ]
    } else if (type === 'extensions') {
      fileName = 'extensions-report.csv'
      rows = [
        toCsvRow(['Publication', 'Student', 'Email', 'Status', 'Requested until', 'Approved until']),
        ...extensions.map((extension) =>
          toCsvRow([
            extension.publication.title,
            extension.student.user.name,
            extension.student.user.email,
            extension.status,
            extension.requestedUntil?.toISOString() ?? '',
            extension.approvedUntil?.toISOString() ?? '',
          ])
        ),
      ]
    } else {
      fileName = 'submission-report.csv'
      rows = [
        toCsvRow(['Publication', 'Student', 'Email', 'Attempt', 'Status', 'Late', 'Penalty']),
        ...attempts.map((attempt) =>
          toCsvRow([
            attempt.publication.title,
            attempt.student.user.name,
            attempt.student.user.email,
            attempt.attemptNumber,
            attempt.status,
            attempt.isLate ? 'yes' : 'no',
            attempt.latePenaltyApplied ?? 0,
          ])
        ),
      ]
    }

    return new NextResponse(rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  return NextResponse.json({
    summary,
    publications: publications.map((publication) => ({
      id: publication.id,
      title: publication.title,
      status: publication.status,
      subjectName: publication.subject.name,
      languageName: publication.language.name,
      groupName: publication.group.name,
      academicYearName: publication.academicYear.name,
      semesterName: publication.semester.name,
      dueAt: publication.dueAt?.toISOString() ?? null,
      counts: publication._count,
    })),
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      publicationId: attempt.publicationId,
      title: attempt.publication.title,
      studentName: attempt.student.user.name,
      studentEmail: attempt.student.user.email,
      groupName: attempt.publication.group.name,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      isLate: attempt.isLate,
      latePenaltyApplied: attempt.latePenaltyApplied,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
    })),
    grades: grades.map((grade) => ({
      id: grade.id,
      publicationId: grade.publicationId,
      title: grade.publication.title,
      studentName: grade.attempt.student.user.name,
      studentEmail: grade.attempt.student.user.email,
      status: grade.status,
      totalScore: grade.totalScore,
      percentage: grade.percentage,
      publishedAt: grade.publishedAt?.toISOString() ?? null,
    })),
    extensions: extensions.map((extension) => ({
      id: extension.id,
      publicationId: extension.publicationId,
      title: extension.publication.title,
      studentName: extension.student.user.name,
      studentEmail: extension.student.user.email,
      status: extension.status,
      requestedUntil: extension.requestedUntil?.toISOString() ?? null,
      approvedUntil: extension.approvedUntil?.toISOString() ?? null,
    })),
  })
}
