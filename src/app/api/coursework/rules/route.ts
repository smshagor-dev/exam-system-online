import { auth } from '@/lib/auth'
import { dedupeTranslations } from '@/lib/academic-content'
import { prisma } from '@/lib/prisma'
import { getAiConfig } from '@/lib/system-settings'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can save coursework rules' }, { status: 403 })
  }

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const body = await request.json()
  const subjectId = String(body.subjectId || '').trim()
  const languageId = String(body.languageId || '').trim()
  const groupId = String(body.groupId || '').trim()
  const academicYearId = String(body.academicYearId || '').trim()
  const semesterId = String(body.semesterId || '').trim()
  const rules = String(body.rules || '').trim()
  const translations = Array.isArray(body.translations)
    ? (body.translations as Array<{ languageId?: string; rules?: string }>)
    : []
  const useAiValidation = Boolean(body.useAiValidation)
  const deadlineInput = String(body.submissionDeadline || '').trim()

  if (!subjectId || !languageId || !groupId || !academicYearId || !semesterId) {
    return NextResponse.json({ error: 'Missing coursework scope fields' }, { status: 400 })
  }

  if (rules.length < 10) {
    return NextResponse.json({ error: 'Rules must be at least 10 characters long' }, { status: 400 })
  }

  const submissionDeadline = deadlineInput ? new Date(deadlineInput) : null
  if (deadlineInput && Number.isNaN(submissionDeadline?.getTime())) {
    return NextResponse.json({ error: 'Invalid deadline date' }, { status: 400 })
  }

  if (useAiValidation) {
    const aiConfig = await getAiConfig()
    if (!aiConfig.enabled || !aiConfig.provider) {
      return NextResponse.json({ error: 'Turn on and configure Teacher AI Settings before enabling AI rule checking.' }, { status: 400 })
    }
  }

  const teacherAssignment = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId: profile.id,
      subjectId,
      languageId,
      groupId,
      academicYearId,
      semesterId,
    },
    select: {
      departmentId: true,
    },
  })

  if (!teacherAssignment) {
    return NextResponse.json({ error: 'You are not assigned to this scope' }, { status: 403 })
  }

  const rule = await prisma.$transaction(async (tx) => {
    const savedRule = await tx.courseworkRule.upsert({
      where: {
        teacherId_subjectId_languageId_groupId_academicYearId_semesterId: {
          teacherId: profile.id,
          subjectId,
          languageId,
          groupId,
          academicYearId,
          semesterId,
        },
      },
      update: {
        rules,
        useAiValidation,
        submissionDeadline,
      },
      create: {
        teacherId: profile.id,
        departmentId: teacherAssignment.departmentId,
        subjectId,
        languageId,
        groupId,
        academicYearId,
        semesterId,
        rules,
        useAiValidation,
        submissionDeadline,
      },
    })

    const mergedTranslations = dedupeTranslations([
      { languageId, rules },
      ...translations
        .filter((translation) => translation && typeof translation.languageId === 'string' && typeof translation.rules === 'string')
        .map((translation) => ({
          languageId: String(translation.languageId),
          rules: String(translation.rules),
        })),
    ])

    for (const translation of mergedTranslations) {
      await tx.courseworkRuleTranslation.upsert({
        where: {
          ruleId_languageId: {
            ruleId: savedRule.id,
            languageId: translation.languageId,
          },
        },
        update: {
          rules: translation.rules,
        },
        create: {
          ruleId: savedRule.id,
          languageId: translation.languageId,
          rules: translation.rules,
        },
      })
    }

    return savedRule
  })

  await prisma.courseworkAssignment.updateMany({
    where: {
      teacherId: profile.id,
      subjectId,
      languageId,
      groupId,
      academicYearId,
      semesterId,
    },
    data: {
      ruleId: rule.id,
      rules,
    },
  })

  return NextResponse.json(rule)
}
