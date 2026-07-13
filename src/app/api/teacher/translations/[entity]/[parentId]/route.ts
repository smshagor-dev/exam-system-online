/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { TranslationStatus } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  assertSupportedDepartmentLanguage,
  buildTranslationState,
  computeCourseworkAssignmentTranslationReport,
  computeCourseworkRuleTranslationReport,
  computeEbookTranslationReport,
  computeExamTranslationReport,
  computeQuestionTranslationReport,
  previewQuestionTranslation,
  resolveTranslationParent,
  type TranslationEntity,
} from '@/lib/phase5-translations'
import {
  parseKeywords,
  resolveCourseworkAssignmentTranslation,
  resolveCourseworkRuleTranslation,
  resolveEbookTranslation,
  resolveExamTranslation,
} from '@/lib/academic-content'

type RouteContext = {
  params: Promise<{
    entity: string
    parentId: string
  }>
}

const SUPPORTED_ENTITIES: TranslationEntity[] = [
  'questions',
  'question-options',
  'exams',
  'coursework-rules',
  'coursework-assignments',
  'ebooks',
]

function isSupportedEntity(value: string): value is TranslationEntity {
  return SUPPORTED_ENTITIES.includes(value as TranslationEntity)
}

async function getActor() {
  const session = await auth()
  if (!session?.user) {
    return null
  }

  return { userId: session.user.id, role: session.user.role }
}

function hasActiveTranslation(entry: any) {
  if (!entry) {
    return false
  }

  return entry.archivedAt == null && entry.status !== TranslationStatus.ARCHIVED
}

function translationAlreadyExists(entity: TranslationEntity, parent: any, languageId: string) {
  if (entity === 'questions' || entity === 'question-options') {
    const questionTranslationExists = parent.translations.some(
      (entry: any) => entry.languageId === languageId && hasActiveTranslation(entry)
    )
    const optionTranslationExists = parent.options.some((option: any) =>
      option.translations.some(
        (entry: any) => entry.languageId === languageId && hasActiveTranslation(entry)
      )
    )

    return questionTranslationExists || optionTranslationExists
  }

  return parent.translations.some(
    (entry: any) => entry.languageId === languageId && hasActiveTranslation(entry)
  )
}

async function saveTranslationForEntity({
  actor,
  entity,
  parent,
  body,
  requireCreate,
}: {
  actor: NonNullable<Awaited<ReturnType<typeof getActor>>>
  entity: TranslationEntity
  parent: any
  body: any
  requireCreate: boolean
}) {
  const languageId = String(body.languageId || '').trim()
  const requestedStatus =
    body.status === TranslationStatus.COMPLETE ? TranslationStatus.COMPLETE : TranslationStatus.DRAFT

  if (!languageId) {
    return NextResponse.json({ error: 'languageId is required' }, { status: 400 })
  }

  await assertSupportedDepartmentLanguage(parent.departmentId, languageId)

  if (languageId === parent.languageId && body.archive === true) {
    return NextResponse.json({ error: 'Base academic language cannot be archived' }, { status: 409 })
  }

  if (requireCreate && translationAlreadyExists(entity, parent, languageId)) {
    return NextResponse.json({ error: 'Translation already exists for this language' }, { status: 409 })
  }

  if (entity === 'questions' || entity === 'question-options') {
    const text = typeof body.text === 'string' ? body.text : ''
    const expectedAnswer = typeof body.expectedAnswer === 'string' ? body.expectedAnswer : null
    const explanation = typeof body.explanation === 'string' ? body.explanation : null
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.filter((entry: unknown) => typeof entry === 'string')
      : []
    const optionTranslations = Array.isArray(body.options) ? body.options : []
    const completeness = computeQuestionTranslationReport({
      languageId,
      questionType: parent.type,
      questionText: text,
      expectedAnswer,
      options: parent.options.map((option: any) => {
        const payloadOption = optionTranslations.find((entry: any) => entry.optionId === option.id)
        return {
          id: option.id,
          orderIndex: option.orderIndex,
          text: typeof payloadOption?.text === 'string' ? payloadOption.text : '',
        }
      }),
    })

    if (requestedStatus === TranslationStatus.COMPLETE && !completeness.isComplete) {
      return NextResponse.json(
        { error: 'Translation is incomplete', completeness },
        { status: 409 }
      )
    }

    const state = buildTranslationState(requestedStatus, completeness.isComplete)

    await prisma.$transaction(async (tx) => {
      const translationData = {
        text,
        expectedAnswer,
        explanation,
        keywords: JSON.stringify(keywords),
        ...state,
      }

      if (requireCreate) {
        await tx.questionTranslation.create({
          data: {
            questionId: parent.id,
            languageId,
            ...translationData,
          },
        })
      } else {
        await tx.questionTranslation.upsert({
          where: {
            questionId_languageId: {
              questionId: parent.id,
              languageId,
            },
          },
          update: translationData,
          create: {
            questionId: parent.id,
            languageId,
            ...translationData,
          },
        })
      }

      for (const option of parent.options) {
        const payloadOption = optionTranslations.find((entry: any) => entry.optionId === option.id)
        const optionText = typeof payloadOption?.text === 'string' ? payloadOption.text : ''
        const optionState = buildTranslationState(requestedStatus, optionText.trim().length > 0)
        const optionData = {
          text: optionText,
          ...optionState,
        }

        if (requireCreate) {
          await tx.questionOptionTranslation.create({
            data: {
              questionOptionId: option.id,
              languageId,
              ...optionData,
            },
          })
        } else {
          await tx.questionOptionTranslation.upsert({
            where: {
              questionOptionId_languageId: {
                questionOptionId: option.id,
                languageId,
              },
            },
            update: optionData,
            create: {
              questionOptionId: option.id,
              languageId,
              ...optionData,
            },
          })
        }
      }
    })

    const refreshed = await resolveTranslationParent(actor, entity, parent.id)
    return NextResponse.json(
      {
        success: true,
        completeness,
        preview: previewQuestionTranslation(refreshed, languageId),
      },
      { status: requireCreate ? 201 : 200 }
    )
  }

  if (entity === 'exams') {
    const title = typeof body.title === 'string' ? body.title : ''
    const description = typeof body.description === 'string' ? body.description : null
    const instructions = typeof body.instructions === 'string' ? body.instructions : null
    const completeness = computeExamTranslationReport({
      languageId,
      title,
      instructions,
    })

    if (requestedStatus === TranslationStatus.COMPLETE && !completeness.isComplete) {
      return NextResponse.json(
        { error: 'Translation is incomplete', completeness },
        { status: 409 }
      )
    }

    const state = buildTranslationState(requestedStatus, completeness.isComplete)
    const translationData = {
      title,
      description,
      instructions,
      ...state,
    }

    if (requireCreate) {
      await prisma.examTranslation.create({
        data: {
          examId: parent.id,
          languageId,
          ...translationData,
        },
      })
    } else {
      await prisma.examTranslation.upsert({
        where: {
          examId_languageId: {
            examId: parent.id,
            languageId,
          },
        },
        update: translationData,
        create: {
          examId: parent.id,
          languageId,
          ...translationData,
        },
      })
    }

    const refreshed = await resolveTranslationParent(actor, entity, parent.id)
    return NextResponse.json(
      {
        success: true,
        completeness,
        preview: resolveExamTranslation(refreshed as any, languageId),
      },
      { status: requireCreate ? 201 : 200 }
    )
  }

  if (entity === 'coursework-rules') {
    const rules = typeof body.rules === 'string' ? body.rules : ''
    const completeness = computeCourseworkRuleTranslationReport({
      languageId,
      rules,
    })

    if (requestedStatus === TranslationStatus.COMPLETE && !completeness.isComplete) {
      return NextResponse.json(
        { error: 'Translation is incomplete', completeness },
        { status: 409 }
      )
    }

    const state = buildTranslationState(requestedStatus, completeness.isComplete)
    const translationData = {
      rules,
      ...state,
    }

    if (requireCreate) {
      await prisma.courseworkRuleTranslation.create({
        data: {
          ruleId: parent.id,
          languageId,
          ...translationData,
        },
      })
    } else {
      await prisma.courseworkRuleTranslation.upsert({
        where: {
          ruleId_languageId: {
            ruleId: parent.id,
            languageId,
          },
        },
        update: translationData,
        create: {
          ruleId: parent.id,
          languageId,
          ...translationData,
        },
      })
    }

    const refreshed = await resolveTranslationParent(actor, entity, parent.id)
    return NextResponse.json(
      {
        success: true,
        completeness,
        preview: resolveCourseworkRuleTranslation(refreshed as any, languageId),
      },
      { status: requireCreate ? 201 : 200 }
    )
  }

  if (entity === 'coursework-assignments') {
    const title = typeof body.title === 'string' ? body.title : ''
    const rules = typeof body.rules === 'string' ? body.rules : null
    const completeness = computeCourseworkAssignmentTranslationReport({
      languageId,
      title,
      rules,
    })

    if (requestedStatus === TranslationStatus.COMPLETE && !completeness.isComplete) {
      return NextResponse.json(
        { error: 'Translation is incomplete', completeness },
        { status: 409 }
      )
    }

    const state = buildTranslationState(requestedStatus, completeness.isComplete)
    const translationData = {
      title,
      rules,
      ...state,
    }

    if (requireCreate) {
      await prisma.courseworkAssignmentTranslation.create({
        data: {
          assignmentId: parent.id,
          languageId,
          ...translationData,
        },
      })
    } else {
      await prisma.courseworkAssignmentTranslation.upsert({
        where: {
          assignmentId_languageId: {
            assignmentId: parent.id,
            languageId,
          },
        },
        update: translationData,
        create: {
          assignmentId: parent.id,
          languageId,
          ...translationData,
        },
      })
    }

    const refreshed = await resolveTranslationParent(actor, entity, parent.id)
    return NextResponse.json(
      {
        success: true,
        completeness,
        preview: resolveCourseworkAssignmentTranslation(refreshed as any, languageId),
      },
      { status: requireCreate ? 201 : 200 }
    )
  }

  const title = typeof body.title === 'string' ? body.title : ''
  const description = typeof body.description === 'string' ? body.description : null
  const author = typeof body.author === 'string' ? body.author : null
  const category = typeof body.category === 'string' ? body.category : null
  const completeness = computeEbookTranslationReport({
    languageId,
    title,
    description,
    author,
    category,
  })

  if (requestedStatus === TranslationStatus.COMPLETE && !completeness.isComplete) {
    return NextResponse.json(
      { error: 'Translation is incomplete', completeness },
      { status: 409 }
    )
  }

  const state = buildTranslationState(requestedStatus, completeness.isComplete)
  const translationData = {
    title,
    description,
    author,
    category,
    ...state,
  }

  if (requireCreate) {
    await prisma.ebookUploadTranslation.create({
      data: {
        ebookUploadId: parent.id,
        languageId,
        ...translationData,
      },
    })
  } else {
    await prisma.ebookUploadTranslation.upsert({
      where: {
        ebookUploadId_languageId: {
          ebookUploadId: parent.id,
          languageId,
        },
      },
      update: translationData,
      create: {
        ebookUploadId: parent.id,
        languageId,
        ...translationData,
      },
    })
  }

  const refreshed = await resolveTranslationParent(actor, entity, parent.id)
  return NextResponse.json(
    {
      success: true,
      completeness,
      preview: resolveEbookTranslation(refreshed as any, languageId),
    },
    { status: requireCreate ? 201 : 200 }
  )
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const actor = await getActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entity, parentId } = await params
  if (!isSupportedEntity(entity)) {
    return NextResponse.json({ error: 'Unsupported translation entity' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const selectedLanguageId = searchParams.get('languageId')

  try {
    const parent = await resolveTranslationParent(actor, entity, parentId)
    const languageId = selectedLanguageId ?? parent.languageId

    if (entity === 'questions' || entity === 'question-options') {
      const translation = parent.translations.find((entry: any) => entry.languageId === languageId) ?? null
      const optionTranslations = parent.options.map((option: any) => {
        const optionTranslation = option.translations.find((entry: any) => entry.languageId === languageId) ?? null
        return {
          optionId: option.id,
          orderIndex: option.orderIndex,
          text: optionTranslation?.text ?? '',
          status: optionTranslation?.status ?? TranslationStatus.DRAFT,
        }
      })
      const completeness = computeQuestionTranslationReport({
        languageId,
        questionType: parent.type,
        questionText: translation?.text ?? '',
        expectedAnswer: translation?.expectedAnswer ?? '',
        options: optionTranslations,
      })

      return NextResponse.json({
        entity,
        parentId: parent.id,
        baseLanguageId: parent.languageId,
        languageId,
        translation: translation
          ? {
              ...translation,
              keywords: parseKeywords(translation.keywords),
            }
          : null,
        optionTranslations,
        completeness,
        preview: previewQuestionTranslation(parent, languageId),
        source: {
          text: parent.text,
          expectedAnswer: parent.expectedAnswer,
          explanation: parent.explanation,
          keywords: parseKeywords(parent.keywords),
        },
      })
    }

    if (entity === 'exams') {
      const translation = parent.translations.find((entry: any) => entry.languageId === languageId) ?? null
      const completeness = computeExamTranslationReport({
        languageId,
        title: translation?.title ?? '',
        instructions: translation?.instructions ?? '',
      })

      return NextResponse.json({
        entity,
        parentId: parent.id,
        baseLanguageId: parent.languageId,
        languageId,
        translation,
        completeness,
        preview: resolveExamTranslation(parent, languageId),
        source: {
          title: parent.title,
          description: parent.description,
          instructions: parent.instructions,
        },
      })
    }

    if (entity === 'coursework-rules') {
      const translation = parent.translations.find((entry: any) => entry.languageId === languageId) ?? null
      const completeness = computeCourseworkRuleTranslationReport({
        languageId,
        rules: translation?.rules ?? '',
      })

      return NextResponse.json({
        entity,
        parentId: parent.id,
        baseLanguageId: parent.languageId,
        languageId,
        translation,
        completeness,
        preview: resolveCourseworkRuleTranslation(parent, languageId),
        source: {
          rules: parent.rules,
        },
      })
    }

    if (entity === 'coursework-assignments') {
      const translation = parent.translations.find((entry: any) => entry.languageId === languageId) ?? null
      const completeness = computeCourseworkAssignmentTranslationReport({
        languageId,
        title: translation?.title ?? '',
        rules: translation?.rules ?? '',
      })

      return NextResponse.json({
        entity,
        parentId: parent.id,
        baseLanguageId: parent.languageId,
        languageId,
        translation,
        completeness,
        preview: resolveCourseworkAssignmentTranslation(parent, languageId),
        source: {
          title: parent.title,
          rules: parent.rules,
        },
      })
    }

    const translation = parent.translations.find((entry: any) => entry.languageId === languageId) ?? null
    const completeness = computeEbookTranslationReport({
      languageId,
      title: translation?.title ?? '',
      description: translation?.description ?? '',
      author: translation?.author ?? '',
      category: translation?.category ?? '',
    })

    return NextResponse.json({
      entity,
      parentId: parent.id,
      baseLanguageId: parent.languageId,
      languageId,
      translation,
      completeness,
      preview: resolveEbookTranslation(parent, languageId),
      source: {
        title: parent.title,
        description: parent.description,
        author: parent.author,
        category: parent.category,
        fileUrl: parent.fileUrl,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load translation'
    const status =
      message === 'Forbidden' ? 403 : message === 'Not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const actor = await getActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entity, parentId } = await params
  if (!isSupportedEntity(entity)) {
    return NextResponse.json({ error: 'Unsupported translation entity' }, { status: 404 })
  }

  try {
    const parent = await resolveTranslationParent(actor, entity, parentId)
    const body = await req.json()
    return await saveTranslationForEntity({
      actor,
      entity,
      parent,
      body,
      requireCreate: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save translation'
    const status =
      message === 'Forbidden'
        ? 403
        : message === 'Not found'
        ? 404
        : message === 'Unsupported language'
        ? 400
        : message === 'Translation already exists for this language'
        ? 409
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const actor = await getActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entity, parentId } = await params
  if (!isSupportedEntity(entity)) {
    return NextResponse.json({ error: 'Unsupported translation entity' }, { status: 404 })
  }

  try {
    const parent = await resolveTranslationParent(actor, entity, parentId)
    const body = await req.json()

    return await saveTranslationForEntity({
      actor,
      entity,
      parent,
      body,
      requireCreate: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create translation'
    const status =
      message === 'Forbidden'
        ? 403
        : message === 'Not found'
        ? 404
        : message === 'Unsupported language'
        ? 400
        : message === 'Translation already exists for this language'
        ? 409
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const actor = await getActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entity, parentId } = await params
  if (!isSupportedEntity(entity)) {
    return NextResponse.json({ error: 'Unsupported translation entity' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const languageId = String(searchParams.get('languageId') || '').trim()

  if (!languageId) {
    return NextResponse.json({ error: 'languageId is required' }, { status: 400 })
  }

  try {
    const parent = await resolveTranslationParent(actor, entity, parentId)

    if (languageId === parent.languageId) {
      return NextResponse.json({ error: 'Base academic language cannot be archived' }, { status: 409 })
    }

    const archiveData = {
      status: TranslationStatus.ARCHIVED,
      archivedAt: new Date(),
      completedAt: null,
    }

    if (entity === 'questions' || entity === 'question-options') {
      await prisma.$transaction(async (tx) => {
        await tx.questionTranslation.updateMany({
          where: {
            questionId: parent.id,
            languageId,
          },
          data: archiveData,
        })
        await tx.questionOptionTranslation.updateMany({
          where: {
            questionOptionId: {
              in: parent.options.map((option: any) => option.id),
            },
            languageId,
          },
          data: archiveData,
        })
      })
    } else if (entity === 'exams') {
      await prisma.examTranslation.updateMany({
        where: {
          examId: parent.id,
          languageId,
        },
        data: archiveData,
      })
    } else if (entity === 'coursework-rules') {
      await prisma.courseworkRuleTranslation.updateMany({
        where: {
          ruleId: parent.id,
          languageId,
        },
        data: archiveData,
      })
    } else if (entity === 'coursework-assignments') {
      await prisma.courseworkAssignmentTranslation.updateMany({
        where: {
          assignmentId: parent.id,
          languageId,
        },
        data: archiveData,
      })
    } else {
      await prisma.ebookUploadTranslation.updateMany({
        where: {
          ebookUploadId: parent.id,
          languageId,
        },
        data: archiveData,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to archive translation'
    const status =
      message === 'Forbidden' ? 403 : message === 'Not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
