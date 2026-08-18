import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  dedupeTranslations,
  resolveQuestionOptionTranslation,
  resolveQuestionTranslation,
  serializeKeywords,
} from '@/lib/academic-content'
import { createQuestionSchema } from '@/lib/validators'
import { Prisma, QuestionType, UserRole } from '@prisma/client'
import { teacherCanAccessAssignment } from '@/lib/permissions'
import {
  buildAccessibleTeachingScopeFilters,
  getTeacherOfferingAssignments,
} from '@/lib/teacher-assignment'
import {
  embedQuestionCodeMetadata,
  isSupportedCodeLanguage,
  type QuestionAnswerMode,
  type QuestionContentMode,
} from '@/lib/question-code'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const subjectId = searchParams.get('subjectId')
  const groupId = searchParams.get('groupId')
  const academicYearId = searchParams.get('academicYearId')
  const semesterId = searchParams.get('semesterId')

  const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const assignments = await getTeacherOfferingAssignments({ teacherProfileId: profile.id })
  const scopeFilters = buildAccessibleTeachingScopeFilters(assignments) as Prisma.QuestionWhereInput[]
  const where: Prisma.QuestionWhereInput = scopeFilters.length > 0
    ? { OR: [...scopeFilters, { teacherId: profile.id }] }
    : { teacherId: profile.id }
  if (subjectId) where.subjectId = subjectId
  if (groupId) where.groupId = groupId
  if (academicYearId) where.academicYearId = academicYearId
  if (semesterId) where.semesterId = semesterId

  const questions = await prisma.question.findMany({
    where,
    include: {
      translations: true,
      options: {
        include: { translations: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    questions.map((question) => {
      const resolvedQuestion = resolveQuestionTranslation(question, question.languageId)

      return {
        ...resolvedQuestion,
        options: question.options.map((option) =>
          resolveQuestionOptionTranslation(option, question.languageId)
        ),
      }
    })
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can create questions' }, { status: 403 })
  }

  const body = await req.json()
  const {
    contentMode: rawContentMode,
    codeContent: rawCodeContent,
    codeLanguage: rawCodeLanguage,
    answerMode: rawAnswerMode,
    answerCodeLanguage: rawAnswerCodeLanguage,
    answerStarterCode: rawAnswerStarterCode,
    ...legacyBody
  } = body

  const parsed = createQuestionSchema.safeParse(legacyBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const contentMode: QuestionContentMode = rawContentMode === 'TEXT_CODE' ? 'TEXT_CODE' : 'TEXT'
  const answerMode: QuestionAnswerMode = rawAnswerMode === 'CODE' ? 'CODE' : 'TEXT'
  const codeContent = typeof rawCodeContent === 'string' ? rawCodeContent : ''
  const codeLanguage = typeof rawCodeLanguage === 'string' ? rawCodeLanguage : 'cpp'
  const answerCodeLanguage =
    typeof rawAnswerCodeLanguage === 'string' ? rawAnswerCodeLanguage : codeLanguage
  const answerStarterCode = typeof rawAnswerStarterCode === 'string' ? rawAnswerStarterCode : ''

  if (contentMode === 'TEXT_CODE') {
    if (!codeContent.trim()) {
      return NextResponse.json({ error: 'Code content is required when question content mode is Text + Code' }, { status: 400 })
    }
    if (!isSupportedCodeLanguage(codeLanguage)) {
      return NextResponse.json({ error: 'Unsupported question code language' }, { status: 400 })
    }
  }

  if (answerMode === 'CODE') {
    if (parsed.data.type !== QuestionType.WRITTEN_ANSWER) {
      return NextResponse.json(
        { error: 'Code answers require the Written Answer question type' },
        { status: 400 }
      )
    }
    if (!isSupportedCodeLanguage(answerCodeLanguage)) {
      return NextResponse.json({ error: 'Unsupported answer code language' }, { status: 400 })
    }
  }

  const storedText = embedQuestionCodeMetadata(parsed.data.text, {
    contentMode,
    codeContent: contentMode === 'TEXT_CODE' ? codeContent : '',
    codeLanguage,
    answerMode,
    answerCodeLanguage,
    answerStarterCode: answerMode === 'CODE' ? answerStarterCode : '',
  })

  const ctx = { userId: session.user.id, role: session.user.role }
  const canAccess = await teacherCanAccessAssignment(ctx, {
    academicOfferingId: parsed.data.academicOfferingId,
    subjectId: parsed.data.subjectId,
    languageId: parsed.data.languageId,
    groupId: parsed.data.groupId,
    academicYearId: parsed.data.academicYearId,
    semesterId: parsed.data.semesterId,
  })

  if (!canAccess) {
    return NextResponse.json({ error: 'You are not assigned to this subject/group/year/semester' }, { status: 403 })
  }

  const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { options, keywords, translations, ...questionData } = parsed.data

  const question = await prisma.$transaction(async (tx) => {
    const createdQuestion = await tx.question.create({
      data: {
        ...questionData,
        text: storedText,
        teacherId: profile.id,
        isActive: false,
        keywords: serializeKeywords(keywords),
        academicOfferingId: parsed.data.academicOfferingId ?? null,
        options: options?.length
          ? {
              create: options.map((opt, i) => ({
                text: opt.text,
                isCorrect: opt.isCorrect,
                orderIndex: opt.orderIndex ?? i,
              })),
            }
          : undefined,
      },
      include: {
        options: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    })

    const mergedTranslations = dedupeTranslations([
      {
        languageId: parsed.data.languageId,
        text: storedText,
        expectedAnswer: parsed.data.expectedAnswer ?? null,
        explanation: parsed.data.explanation ?? null,
        keywords: serializeKeywords(parsed.data.keywords),
        options:
          options?.map((option) => ({
            languageId: parsed.data.languageId,
            orderIndex: option.orderIndex,
            text: option.text,
          })) ?? [],
      },
      ...(translations ?? []).map((translation) => ({
        languageId: translation.languageId,
        text: translation.text,
        expectedAnswer: translation.expectedAnswer ?? null,
        explanation: translation.explanation ?? null,
        keywords: serializeKeywords(translation.keywords),
        options: translation.options ?? [],
      })),
    ])

    if (mergedTranslations.length > 0) {
      await tx.questionTranslation.createMany({
        data: mergedTranslations.map((translation) => ({
          questionId: createdQuestion.id,
          languageId: translation.languageId,
          text: translation.text,
          expectedAnswer: translation.expectedAnswer ?? null,
          explanation: translation.explanation ?? null,
          keywords: translation.keywords ?? null,
        })),
      })
    }

    for (const option of createdQuestion.options) {
      const optionTranslations = mergedTranslations
        .map((translation) => {
          const matchedOption = translation.options?.find(
            (entry) => entry.orderIndex === option.orderIndex
          )

          return matchedOption
            ? {
                questionOptionId: option.id,
                languageId: translation.languageId,
                text: matchedOption.text,
              }
            : null
        })
        .filter((value): value is { questionOptionId: string; languageId: string; text: string } => Boolean(value))

      if (optionTranslations.length > 0) {
        await tx.questionOptionTranslation.createMany({ data: optionTranslations })
      }
    }

    return tx.question.findUniqueOrThrow({
      where: { id: createdQuestion.id },
      include: {
        translations: true,
        options: {
          include: { translations: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    })
  })

  const resolvedQuestion = resolveQuestionTranslation(question, question.languageId)

  return NextResponse.json(
    {
      ...resolvedQuestion,
      options: question.options.map((option) =>
        resolveQuestionOptionTranslation(option, question.languageId)
      ),
    },
    { status: 201 }
  )
}
