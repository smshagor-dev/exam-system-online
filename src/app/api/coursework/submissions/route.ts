import { auth } from '@/lib/auth'
import {
  resolveCourseworkAssignmentTranslation,
  resolveCourseworkRuleTranslation,
} from '@/lib/academic-content'
import { COURSEWORK_DIR, MAX_COURSEWORK_SIZE, sanitizeCourseworkFileName } from '@/lib/coursework'
import { prisma } from '@/lib/prisma'
import { getAiConfig } from '@/lib/system-settings'
import { validateCourseworkWithAi } from '@/services/coursework-ai.service'
import { CourseworkAccessRequestStatus, CourseworkSubmissionStatus, UserRole } from '@prisma/client'
import mammoth from 'mammoth'
import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can submit coursework' }, { status: 403 })
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const assignmentId = String(formData.get('assignmentId') || '').trim()
  const file = formData.get('file')

  if (!assignmentId) {
    return NextResponse.json({ error: 'Assignment is required' }, { status: 400 })
  }

  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: 'Please upload a DOCX file' }, { status: 400 })
  }

  const extension = file.name.split('.').pop()?.toLowerCase()
  const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx'
  if (!isDocx) {
    return NextResponse.json({ error: 'Only DOCX submissions are allowed' }, { status: 400 })
  }

  if (file.size > MAX_COURSEWORK_SIZE) {
    return NextResponse.json({ error: 'DOCX size must be 10MB or less' }, { status: 400 })
  }

  const assignment = await prisma.courseworkAssignment.findFirst({
    where: {
      id: assignmentId,
      studentId: profile.id,
    },
    select: {
      id: true,
      studentId: true,
      title: true,
      rules: true,
      rule: {
        select: {
          languageId: true,
          rules: true,
          useAiValidation: true,
          submissionDeadline: true,
          translations: true,
        },
      },
      languageId: true,
      translations: true,
      accessRequests: {
        where: {
          status: CourseworkAccessRequestStatus.APPROVED,
        },
        orderBy: {
          reviewedAt: 'desc',
        },
        take: 1,
      },
    },
  })

  if (!assignment) {
    return NextResponse.json({ error: 'Coursework assignment not found' }, { status: 404 })
  }

  const resolvedAssignment = resolveCourseworkAssignmentTranslation(assignment, assignment.languageId)
  const resolvedRule = assignment.rule
    ? resolveCourseworkRuleTranslation(assignment.rule, assignment.languageId)
    : null
  const activeRules = resolvedRule?.rules ?? resolvedAssignment.rules ?? ''
  if (activeRules.trim().length < 10) {
    return NextResponse.json({ error: 'Coursework rules are not configured yet' }, { status: 400 })
  }

  const approvedAccess = assignment.accessRequests[0] ?? null
  const extensionActive = Boolean(
    approvedAccess?.extensionDeadline && approvedAccess.extensionDeadline.getTime() > Date.now()
  )

  if (assignment.rule?.submissionDeadline && assignment.rule.submissionDeadline.getTime() < Date.now() && !extensionActive) {
    return NextResponse.json({ error: 'Submission deadline has already passed for this coursework' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const extracted = await mammoth.extractRawText({ buffer })
  const extractedText = extracted.value.trim()

  if (!extractedText) {
    return NextResponse.json({ error: 'No readable text was found in the uploaded DOCX file' }, { status: 400 })
  }

  await mkdir(COURSEWORK_DIR, { recursive: true })
  const safeName = sanitizeCourseworkFileName(file.name.replace(/\.docx$/i, ''))
  const fileName = `${profile.id}-${assignment.id}-${Date.now()}-${safeName || 'coursework'}.docx`
  const filePath = path.join(COURSEWORK_DIR, fileName)
  const fileUrl = `/uploads/coursework/${fileName}`
  await writeFile(filePath, buffer)

  let status: CourseworkSubmissionStatus = CourseworkSubmissionStatus.ACCEPTED
  let aiFeedback: string | null = null

  if (assignment.rule?.useAiValidation) {
    const aiConfig = await getAiConfig()
    if (!aiConfig.enabled || !aiConfig.provider) {
      try {
        await unlink(filePath)
      } catch {
        // Ignore file cleanup failures here.
      }
      return NextResponse.json({ error: 'This coursework requires AI verification, but Teacher AI Settings are not configured right now.' }, { status: 500 })
    }

    try {
      const validation = await validateCourseworkWithAi(activeRules, extractedText)
      if (!validation) {
        throw new Error('AI validation returned no result')
      }
      if (!validation.accepted) {
        status = CourseworkSubmissionStatus.REJECTED
        aiFeedback = validation.feedback
      }
    } catch (error) {
      console.error('[Coursework AI] Validation failed:', error)
      try {
        await unlink(filePath)
      } catch {
        // Ignore file cleanup failures here.
      }
      return NextResponse.json({ error: 'AI verification failed. Please try again after the teacher checks AI settings.' }, { status: 500 })
    }
  }

  const submission = await prisma.courseworkSubmission.create({
    data: {
      assignmentId: assignment.id,
      studentId: profile.id,
      fileName,
      fileUrl,
      fileSizeBytes: file.size,
      extractedText,
      status,
      aiFeedback,
    },
  })

  return NextResponse.json({
    submission,
    accepted: status !== CourseworkSubmissionStatus.REJECTED,
    message:
      status === CourseworkSubmissionStatus.REJECTED
        ? aiFeedback || 'Your submission did not match the coursework rules. Please update and resubmit.'
        : 'Coursework submitted successfully.',
  })
}
