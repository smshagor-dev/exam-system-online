import { auth } from '@/lib/auth'
import {
  calculateCourseworkGradeTotals,
  createCourseworkActivityLog,
  createCourseworkNotification,
} from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermissionForPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import {
  CourseworkGradeStatus,
  CourseworkModerationDecisionStatus,
  CourseworkReviewRequestStatus,
  UserRole,
} from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can grade coursework' }, { status: 403 })
  }

  const { id } = await context.params
  const allowed = await teacherHasCourseworkPermissionForPublication(
    { userId: session.user.id, role: session.user.role },
    'coursework.grade',
    id
  )
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission to grade this coursework publication' }, { status: 403 })
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacherProfile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const body = await request.json()
  const attemptId = String(body.attemptId || '').trim()
  const workflowAction = String(body.workflowAction || '').trim().toUpperCase()
  if (!attemptId) {
    return NextResponse.json({ error: 'Attempt is required' }, { status: 400 })
  }

  const attempt = await prisma.courseworkAttempt.findFirst({
    where: {
      id: attemptId,
      publicationId: id,
    },
    include: {
      student: {
        include: {
          user: {
            select: { id: true },
          },
        },
      },
      publication: {
        include: {
          rubric: {
            include: {
              criteria: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
        },
      },
    },
  })
  if (!attempt) {
    return NextResponse.json({ error: 'Coursework attempt not found' }, { status: 404 })
  }

  const criterionScoresInput: Array<{
    criterionId: string
    selectedLevelId: string | null
    awardedScore: number
    feedback: string | null
  }> = Array.isArray(body.criterionScores)
    ? body.criterionScores.map((score: Record<string, unknown>) => ({
        criterionId: String(score.criterionId || '').trim(),
        selectedLevelId: String(score.selectedLevelId || '').trim() || null,
        awardedScore: Math.max(0, Number(score.awardedScore) || 0),
        feedback: typeof score.feedback === 'string' ? score.feedback.trim() : null,
      }))
    : []

  const maxScore =
    attempt.publication.rubric?.criteria.reduce((sum, criterion) => sum + criterion.maximumMarks, 0) ?? 0
  const totals = calculateCourseworkGradeTotals({
    criterionScores: criterionScoresInput,
    manualAdjustment: Number(body.manualAdjustment) || 0,
    maxScore,
    latePenaltyApplied: attempt.latePenaltyApplied,
  })
  const status = Object.values(CourseworkGradeStatus).includes(body.status)
    ? body.status
    : CourseworkGradeStatus.DRAFT

  try {
    const grade = await prisma.$transaction(async (tx) => {
      const existingGrade = await tx.courseworkGrade.findUnique({
        where: { attemptId: attempt.id },
        include: {
          moderationDecisions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      })

    const latestModerationDecision = existingGrade?.moderationDecisions[0] ?? null

    if (
      existingGrade?.status === CourseworkGradeStatus.PUBLISHED &&
      body.allowRevision !== true
    ) {
      throw new Error('Published grades are immutable without an audited revision flow')
    }

    const isPrimaryGrader =
      !existingGrade || existingGrade.primaryGraderId === teacherProfile.id
    const isSelfApproval =
      existingGrade != null && existingGrade.primaryGraderId === teacherProfile.id

    let effectiveStatus = status
    let activityTransition = 'coursework.grade.save'
    let shouldAppendModerationDecision = false
    let moderationDecisionStatus: CourseworkModerationDecisionStatus | null = null

    if (workflowAction) {
      switch (workflowAction) {
        case 'SAVE_DRAFT': {
          if (!isPrimaryGrader) {
            throw new Error('Only the primary grader can save a draft grade')
          }
          effectiveStatus = CourseworkGradeStatus.DRAFT
          activityTransition = 'coursework.grade.draft'
          break
        }
        case 'SUBMIT_FOR_MODERATION': {
          if (!isPrimaryGrader) {
            throw new Error('Only the primary grader can submit a grade for moderation')
          }
          effectiveStatus = CourseworkGradeStatus.MODERATION
          activityTransition = 'coursework.grade.submit_for_moderation'
          break
        }
        case 'RESUBMIT': {
          if (!isPrimaryGrader) {
            throw new Error('Only the primary grader can resubmit a grade after requested changes')
          }
          if (latestModerationDecision?.status !== CourseworkModerationDecisionStatus.CHANGES_REQUESTED) {
            throw new Error('A resubmission requires a prior changes-requested moderation decision')
          }
          effectiveStatus = CourseworkGradeStatus.MODERATION
          activityTransition = 'coursework.grade.resubmit'
          break
        }
        case 'REQUEST_CHANGES': {
          if (!existingGrade) {
            throw new Error('A grade must exist before moderation can request changes')
          }
          if (existingGrade.status !== CourseworkGradeStatus.MODERATION) {
            throw new Error('Only grades in moderation can receive change requests')
          }
          if (isSelfApproval && body.allowSelfApproval !== true) {
            throw new Error('Self-moderation is denied unless explicitly allowed')
          }
          effectiveStatus = CourseworkGradeStatus.SUBMITTED
          activityTransition = 'coursework.grade.changes_requested'
          shouldAppendModerationDecision = true
          moderationDecisionStatus = CourseworkModerationDecisionStatus.CHANGES_REQUESTED
          break
        }
        case 'APPROVE': {
          if (!existingGrade) {
            throw new Error('A grade must exist before moderation can approve it')
          }
          if (existingGrade.status !== CourseworkGradeStatus.MODERATION) {
            throw new Error('Only grades in moderation can be approved')
          }
          if (isSelfApproval && body.allowSelfApproval !== true) {
            throw new Error('Self-approval is denied unless explicitly allowed')
          }
          effectiveStatus = CourseworkGradeStatus.APPROVED
          activityTransition = 'coursework.grade.approve'
          shouldAppendModerationDecision = true
          moderationDecisionStatus = CourseworkModerationDecisionStatus.APPROVED
          break
        }
        case 'PUBLISH': {
          if (!existingGrade) {
            throw new Error('A grade must exist before it can be published')
          }
          if (existingGrade.status !== CourseworkGradeStatus.APPROVED) {
            throw new Error('Only approved grades can be published')
          }
          effectiveStatus = CourseworkGradeStatus.PUBLISHED
          activityTransition = 'coursework.grade.publish'
          break
        }
        default: {
          throw new Error(`Unsupported grade workflow action: ${workflowAction}`)
        }
      }
    }

    const savedGrade = await tx.courseworkGrade.upsert({
      where: { attemptId: attempt.id },
      update: {
        rubricId: attempt.publication.rubric?.id ?? null,
        primaryGraderId: existingGrade?.primaryGraderId ?? teacherProfile.id,
        moderatorId:
          workflowAction === 'APPROVE' || workflowAction === 'REQUEST_CHANGES'
            ? teacherProfile.id
            : existingGrade?.moderatorId ?? null,
        status: effectiveStatus,
        departmentApproverId:
          workflowAction === 'APPROVE' && body.departmentApprove === true
            ? teacherProfile.id
            : existingGrade?.departmentApproverId ?? null,
        maxScore,
        rubricScore: totals.rubricScore,
        manualAdjustment: Number(body.manualAdjustment) || 0,
        totalScore: totals.totalScore,
        percentage: totals.percentage,
        textFeedback: typeof body.textFeedback === 'string' ? body.textFeedback.trim() : null,
        privateNotes: typeof body.privateNotes === 'string' ? body.privateNotes.trim() : null,
        submittedAt:
          effectiveStatus === CourseworkGradeStatus.SUBMITTED ||
          effectiveStatus === CourseworkGradeStatus.MODERATION ||
          effectiveStatus === CourseworkGradeStatus.APPROVED ||
          effectiveStatus === CourseworkGradeStatus.PUBLISHED
            ? existingGrade?.submittedAt ?? new Date()
            : existingGrade?.submittedAt ?? null,
        approvedAt:
          effectiveStatus === CourseworkGradeStatus.APPROVED || effectiveStatus === CourseworkGradeStatus.PUBLISHED
            ? new Date()
            : null,
        publishedAt: effectiveStatus === CourseworkGradeStatus.PUBLISHED ? new Date() : null,
      },
      create: {
        publicationId: id,
        attemptId: attempt.id,
        studentId: attempt.studentId,
        rubricId: attempt.publication.rubric?.id ?? null,
        primaryGraderId: teacherProfile.id,
        moderatorId:
          workflowAction === 'APPROVE' || workflowAction === 'REQUEST_CHANGES'
            ? teacherProfile.id
            : null,
        departmentApproverId:
          workflowAction === 'APPROVE' && body.departmentApprove === true
            ? teacherProfile.id
            : null,
        status: effectiveStatus,
        reviewRequestStatus: CourseworkReviewRequestStatus.NOT_REQUESTED,
        maxScore,
        rubricScore: totals.rubricScore,
        manualAdjustment: Number(body.manualAdjustment) || 0,
        totalScore: totals.totalScore,
        percentage: totals.percentage,
        textFeedback: typeof body.textFeedback === 'string' ? body.textFeedback.trim() : null,
        privateNotes: typeof body.privateNotes === 'string' ? body.privateNotes.trim() : null,
        submittedAt:
          effectiveStatus === CourseworkGradeStatus.SUBMITTED ||
          effectiveStatus === CourseworkGradeStatus.MODERATION ||
          effectiveStatus === CourseworkGradeStatus.APPROVED ||
          effectiveStatus === CourseworkGradeStatus.PUBLISHED
            ? new Date()
            : null,
        approvedAt:
          effectiveStatus === CourseworkGradeStatus.APPROVED || effectiveStatus === CourseworkGradeStatus.PUBLISHED
            ? new Date()
            : null,
        publishedAt: effectiveStatus === CourseworkGradeStatus.PUBLISHED ? new Date() : null,
      },
    })

    if (criterionScoresInput.length > 0) {
      await tx.courseworkGradeCriterionScore.deleteMany({
        where: { gradeId: savedGrade.id },
      })
      await tx.courseworkGradeCriterionScore.createMany({
        data: criterionScoresInput.map((score) => ({
          gradeId: savedGrade.id,
          criterionId: score.criterionId,
          selectedLevelId: score.selectedLevelId,
          score: score.awardedScore,
          feedback: score.feedback,
        })),
      })
    }

    if (shouldAppendModerationDecision && moderationDecisionStatus) {
      await tx.courseworkModerationDecision.create({
        data: {
          gradeId: savedGrade.id,
          moderatorId: teacherProfile.id,
          status: moderationDecisionStatus,
          departmentDecision:
            workflowAction === 'APPROVE' && body.departmentApprove === true ? true : null,
          notes: typeof body.moderationNotes === 'string' ? body.moderationNotes.trim() : null,
          decidedAt: new Date(),
        },
      })
    } else if (
      body.moderationDecisionStatus &&
      Object.values(CourseworkModerationDecisionStatus).includes(body.moderationDecisionStatus)
    ) {
      await tx.courseworkModerationDecision.create({
        data: {
          gradeId: savedGrade.id,
          moderatorId: teacherProfile.id,
          status: body.moderationDecisionStatus,
          notes: typeof body.moderationNotes === 'string' ? body.moderationNotes.trim() : null,
          decidedAt:
            body.moderationDecisionStatus === CourseworkModerationDecisionStatus.PENDING
              ? null
              : new Date(),
        },
      })
    }

      return {
        ...savedGrade,
        _activityTransition: activityTransition,
      }
    })

    if (grade.status === CourseworkGradeStatus.PUBLISHED) {
      await createCourseworkNotification({
        userId: attempt.student.user.id,
        title: 'Coursework grade published',
        message: `Your grade for ${attempt.publication.title} is now available.`,
        link: '/student/coursework',
        dedupeWindowMs: 60_000,
      })
    }

    await createCourseworkActivityLog({
      userId: session.user.id,
      action: grade._activityTransition,
      details: JSON.stringify({ publicationId: id, attemptId: attempt.id, gradeId: grade.id, status: grade.status, workflowAction: workflowAction || null }),
    })

    return NextResponse.json({ grade })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save coursework grade workflow' },
      { status: 400 }
    )
  }
}
