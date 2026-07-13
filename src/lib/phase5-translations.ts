/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
import {
  TranslationStatus,
  TeachingAssignmentRoleType,
  UserRole,
  type Prisma,
} from '@prisma/client'
import {
  canManageDepartment,
} from '@/lib/permissions'
import {
  parseKeywords,
  resolveCourseworkAssignmentTranslation,
  resolveCourseworkRuleTranslation,
  resolveEbookTranslation,
  resolveExamTranslation,
  resolveQuestionOptionTranslation,
  resolveQuestionTranslation,
  serializeKeywords,
} from '@/lib/academic-content'
import { prisma } from '@/lib/prisma'
import {
  buildAccessibleTeachingScopeFilters,
  getTeacherOfferingAssignments,
  getTeacherProfileByUserId,
  validateTeacherOfferingAccess,
} from '@/lib/teacher-assignment'

export type TranslationEntity =
  | 'questions'
  | 'question-options'
  | 'exams'
  | 'coursework-rules'
  | 'coursework-assignments'
  | 'ebooks'

export type TranslationActor = {
  userId: string
  role: UserRole
}

export type TranslationMissingField = {
  field: string
  message: string
}

export type TranslationCompletenessReport = {
  entity: TranslationEntity
  languageId: string
  isComplete: boolean
  missingFields: TranslationMissingField[]
}

export type PublicationCompletenessResult = {
  canPublish: boolean
  requiredLanguageId: string
  missingFields: TranslationMissingField[]
}

const activeTranslationRelationFilter = {
  OR: [
    { archivedAt: null },
    { archivedAt: { isSet: false } },
  ],
}

function hasContent(value: string | null | undefined) {
  if (!value) return false

  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length > 0
}

function isQuestionAnswerRequired(type: string) {
  return type === 'SHORT_ANSWER' || type === 'WRITTEN_ANSWER'
}

function allowedTeacherRoles(entity: TranslationEntity) {
  if (entity === 'exams') {
    return [
      TeachingAssignmentRoleType.LEAD_TEACHER,
      TeachingAssignmentRoleType.ASSISTANT_TEACHER,
      TeachingAssignmentRoleType.LECTURER,
      TeachingAssignmentRoleType.EXAMINER,
      TeachingAssignmentRoleType.MODERATOR,
      TeachingAssignmentRoleType.SUBSTITUTE,
    ]
  }

  if (entity === 'coursework-rules' || entity === 'coursework-assignments' || entity === 'ebooks') {
    return [
      TeachingAssignmentRoleType.LEAD_TEACHER,
      TeachingAssignmentRoleType.ASSISTANT_TEACHER,
      TeachingAssignmentRoleType.LECTURER,
      TeachingAssignmentRoleType.LAB_INSTRUCTOR,
      TeachingAssignmentRoleType.COURSE_COORDINATOR,
      TeachingAssignmentRoleType.SUBSTITUTE,
    ]
  }

  return [
    TeachingAssignmentRoleType.LEAD_TEACHER,
    TeachingAssignmentRoleType.ASSISTANT_TEACHER,
    TeachingAssignmentRoleType.LECTURER,
    TeachingAssignmentRoleType.REVIEWER,
    TeachingAssignmentRoleType.MODERATOR,
    TeachingAssignmentRoleType.SUBSTITUTE,
  ]
}

async function assertScopeAccess(
  actor: TranslationActor,
  entity: TranslationEntity,
  scope: {
    departmentId: string
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
    academicOfferingId?: string | null
  }
) {
  if (actor.role === UserRole.SUPER_ADMIN) {
    return
  }

  if (actor.role === UserRole.DEPARTMENT_ADMIN) {
    const allowed = await canManageDepartment(actor, scope.departmentId)
    if (!allowed) {
      throw new Error('Forbidden')
    }
    return
  }

  if (actor.role !== UserRole.TEACHER) {
    throw new Error('Forbidden')
  }

  const profile = await getTeacherProfileByUserId(actor.userId)
  if (!profile) {
    throw new Error('Teacher profile not found')
  }

  const access = await validateTeacherOfferingAccess({
    teacherProfileId: profile.id,
    academicOfferingId: scope.academicOfferingId ?? null,
    scope,
    allowedRoles: allowedTeacherRoles(entity),
  })

  if (!access.allowed) {
    throw new Error('Forbidden')
  }
}

export async function getSupportedDepartmentLanguages(departmentId: string) {
  return prisma.departmentLanguage.findMany({
    where: {
      departmentId,
      isActive: true,
      language: {
        isActive: true,
      },
    },
    include: {
      language: true,
    },
    orderBy: {
      language: {
        name: 'asc',
      },
    },
  })
}

export async function assertSupportedDepartmentLanguage(departmentId: string, languageId: string) {
  const supported = await prisma.departmentLanguage.findFirst({
    where: {
      departmentId,
      languageId,
      isActive: true,
    },
  })

  if (!supported) {
    throw new Error('Unsupported language')
  }
}

export function computeQuestionTranslationReport(input: {
  languageId: string
  questionType: string
  questionText?: string | null
  expectedAnswer?: string | null
  options: Array<{ id: string; text?: string | null; orderIndex: number }>
}) {
  const missingFields: TranslationMissingField[] = []

  if (!hasContent(input.questionText)) {
    missingFields.push({ field: 'text', message: 'Question text is required.' })
  }

  if (isQuestionAnswerRequired(input.questionType) && !hasContent(input.expectedAnswer)) {
    missingFields.push({
      field: 'expectedAnswer',
      message: 'Expected answer is required for this question type.',
    })
  }

  if (input.questionType === 'MCQ' || input.questionType === 'TRUE_FALSE') {
    for (const option of input.options) {
      if (!hasContent(option.text)) {
        missingFields.push({
          field: `options.${option.orderIndex}.text`,
          message: `Option ${option.orderIndex + 1} text is required.`,
        })
      }
    }
  }

  return {
    entity: 'questions' as const,
    languageId: input.languageId,
    isComplete: missingFields.length === 0,
    missingFields,
  }
}

export function computeExamTranslationReport(input: {
  languageId: string
  title?: string | null
  instructions?: string | null
}) {
  const missingFields: TranslationMissingField[] = []

  if (!hasContent(input.title)) {
    missingFields.push({ field: 'title', message: 'Exam title is required.' })
  }

  if (!hasContent(input.instructions)) {
    missingFields.push({
      field: 'instructions',
      message: 'Exam instructions are required before publication.',
    })
  }

  return {
    entity: 'exams' as const,
    languageId: input.languageId,
    isComplete: missingFields.length === 0,
    missingFields,
  }
}

export function computeCourseworkRuleTranslationReport(input: {
  languageId: string
  rules?: string | null
}) {
  const missingFields: TranslationMissingField[] = []

  if (!hasContent(input.rules)) {
    missingFields.push({
      field: 'rules',
      message: 'Coursework instructions are required.',
    })
  }

  return {
    entity: 'coursework-rules' as const,
    languageId: input.languageId,
    isComplete: missingFields.length === 0,
    missingFields,
  }
}

export function computeCourseworkAssignmentTranslationReport(input: {
  languageId: string
  title?: string | null
  rules?: string | null
}) {
  const missingFields: TranslationMissingField[] = []

  if (!hasContent(input.title)) {
    missingFields.push({ field: 'title', message: 'Assignment title is required.' })
  }

  if (!hasContent(input.rules)) {
    missingFields.push({
      field: 'rules',
      message: 'Translated coursework instructions are required.',
    })
  }

  return {
    entity: 'coursework-assignments' as const,
    languageId: input.languageId,
    isComplete: missingFields.length === 0,
    missingFields,
  }
}

export function computeEbookTranslationReport(input: {
  languageId: string
  title?: string | null
  description?: string | null
  author?: string | null
  category?: string | null
}) {
  const missingFields: TranslationMissingField[] = []

  if (!hasContent(input.title)) {
    missingFields.push({ field: 'title', message: 'Ebook title is required.' })
  }
  if (!hasContent(input.description)) {
    missingFields.push({ field: 'description', message: 'Ebook description is required.' })
  }
  if (!hasContent(input.author)) {
    missingFields.push({ field: 'author', message: 'Ebook author metadata is required.' })
  }
  if (!hasContent(input.category)) {
    missingFields.push({ field: 'category', message: 'Ebook category metadata is required.' })
  }

  return {
    entity: 'ebooks' as const,
    languageId: input.languageId,
    isComplete: missingFields.length === 0,
    missingFields,
  }
}

export function buildPublicationResult(
  requiredLanguageId: string,
  reports: Array<TranslationCompletenessReport | { missingFields: TranslationMissingField[] }>
) {
  const missingFields = reports.flatMap((report) => report.missingFields)

  return {
    canPublish: missingFields.length === 0,
    requiredLanguageId,
    missingFields,
  }
}

export function validateQuestionPublication(question: any, requiredLanguageId: string) {
  const translation = question.translations.find((entry: any) => entry.languageId === requiredLanguageId)
  const optionStates = question.options.map((option: any) => {
    const optionTranslation = option.translations.find(
      (entry: any) => entry.languageId === requiredLanguageId
    )

    return {
      id: option.id,
      orderIndex: option.orderIndex,
      text: optionTranslation?.text ?? '',
    }
  })

  const report = computeQuestionTranslationReport({
    languageId: requiredLanguageId,
    questionType: question.type,
    questionText: translation?.text ?? '',
    expectedAnswer: translation?.expectedAnswer ?? '',
    options: optionStates,
  })

  return buildPublicationResult(requiredLanguageId, [report])
}

export function validateExamPublication(exam: any, requiredLanguageId: string) {
  const translation = exam.translations.find((entry: any) => entry.languageId === requiredLanguageId)
  const examReport = computeExamTranslationReport({
    languageId: requiredLanguageId,
    title: translation?.title ?? '',
    instructions: translation?.instructions ?? '',
  })

  const questionReports = exam.questions.map((entry: any) =>
    computeQuestionTranslationReport({
      languageId: requiredLanguageId,
      questionType: entry.question.type,
      questionText:
        entry.question.translations.find((candidate: any) => candidate.languageId === requiredLanguageId)?.text ?? '',
      expectedAnswer:
        entry.question.translations.find((candidate: any) => candidate.languageId === requiredLanguageId)?.expectedAnswer ?? '',
      options: entry.question.options.map((option: any) => ({
        id: option.id,
        orderIndex: option.orderIndex,
        text:
          option.translations.find((candidate: any) => candidate.languageId === requiredLanguageId)?.text ?? '',
      })),
    })
  )

  return buildPublicationResult(requiredLanguageId, [examReport, ...questionReports])
}

export function validateCourseworkAssignmentPublication(assignment: any, requiredLanguageId: string) {
  const translation = assignment.translations.find((entry: any) => entry.languageId === requiredLanguageId)
  const ruleTranslation = assignment.rule?.translations.find(
    (entry: any) => entry.languageId === requiredLanguageId
  )

  const ruleReport = computeCourseworkRuleTranslationReport({
    languageId: requiredLanguageId,
    rules: ruleTranslation?.rules ?? '',
  })
  const assignmentReport = computeCourseworkAssignmentTranslationReport({
    languageId: requiredLanguageId,
    title: translation?.title ?? '',
    rules: translation?.rules ?? '',
  })

  return buildPublicationResult(requiredLanguageId, [ruleReport, assignmentReport])
}

export function buildTranslationState(
  requestedStatus: TranslationStatus | undefined,
  isComplete: boolean
) {
  const status =
    requestedStatus === TranslationStatus.COMPLETE && isComplete
      ? TranslationStatus.COMPLETE
      : requestedStatus === TranslationStatus.ARCHIVED
      ? TranslationStatus.ARCHIVED
      : TranslationStatus.DRAFT

  return {
    status,
    completedAt: status === TranslationStatus.COMPLETE ? new Date() : null,
    archivedAt: status === TranslationStatus.ARCHIVED ? new Date() : null,
  }
}

export async function resolveTranslationParent(
  actor: TranslationActor,
  entity: TranslationEntity,
  parentId: string
) {
  if (entity === 'questions' || entity === 'question-options') {
    const question = await prisma.question.findUnique({
      where: { id: parentId },
      include: {
        translations: {
          where: activeTranslationRelationFilter,
          orderBy: { createdAt: 'asc' },
        },
        options: {
          include: {
            translations: {
              where: activeTranslationRelationFilter,
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
      },
    })

    if (!question) {
      throw new Error('Not found')
    }

    await assertScopeAccess(actor, entity, question)
    return question
  }

  if (entity === 'exams') {
    const exam = await prisma.exam.findUnique({
      where: { id: parentId },
      include: {
        translations: {
          where: activeTranslationRelationFilter,
          orderBy: { createdAt: 'asc' },
        },
        questions: {
          include: {
            question: {
              include: {
                translations: {
                  where: activeTranslationRelationFilter,
                },
                options: {
                  include: {
                    translations: {
                      where: activeTranslationRelationFilter,
                    },
                  },
                },
              },
            },
          },
        },
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
      },
    })

    if (!exam) {
      throw new Error('Not found')
    }

    await assertScopeAccess(actor, entity, exam)
    return exam
  }

  if (entity === 'coursework-rules') {
    const rule = await prisma.courseworkRule.findUnique({
      where: { id: parentId },
      include: {
        translations: {
          where: activeTranslationRelationFilter,
          orderBy: { createdAt: 'asc' },
        },
        assignments: {
          include: {
            translations: {
              where: activeTranslationRelationFilter,
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
          orderBy: {
            student: {
              user: {
                name: 'asc',
              },
            },
          },
        },
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
      },
    })

    if (!rule) {
      throw new Error('Not found')
    }

    await assertScopeAccess(actor, entity, rule)
    return rule
  }

  if (entity === 'coursework-assignments') {
    const assignment = await prisma.courseworkAssignment.findUnique({
      where: { id: parentId },
      include: {
        translations: {
          where: activeTranslationRelationFilter,
          orderBy: { createdAt: 'asc' },
        },
        rule: {
          include: {
            translations: {
              where: activeTranslationRelationFilter,
            },
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
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
      },
    })

    if (!assignment) {
      throw new Error('Not found')
    }

    await assertScopeAccess(actor, entity, assignment)
    return assignment
  }

  const ebook = await prisma.ebookUpload.findUnique({
    where: { id: parentId },
    include: {
      translations: {
        where: activeTranslationRelationFilter,
        orderBy: { createdAt: 'asc' },
      },
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
    },
  })

  if (!ebook) {
    throw new Error('Not found')
  }

  await assertScopeAccess(actor, entity, ebook)
  return ebook
}

export async function getEntityList(
  actor: TranslationActor,
  entity: TranslationEntity,
  filters: {
    languageId?: string | null
    missingOnly?: boolean
    departmentId?: string | null
  }
) {
  const where: Prisma.QuestionWhereInput | Prisma.ExamWhereInput | Prisma.CourseworkRuleWhereInput | Prisma.CourseworkAssignmentWhereInput | Prisma.EbookUploadWhereInput =
    {}

  if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.DEPARTMENT_ADMIN) {
    if (actor.role === UserRole.DEPARTMENT_ADMIN && filters.departmentId) {
      const allowed = await canManageDepartment(actor, filters.departmentId)
      if (!allowed) {
        throw new Error('Forbidden')
      }
    }
  } else {
    const profile = await getTeacherProfileByUserId(actor.userId)
    if (!profile) {
      throw new Error('Teacher profile not found')
    }

    const assignments = await getTeacherOfferingAssignments({ teacherProfileId: profile.id })
    const scopedAssignments = assignments.filter((assignment) =>
      assignment.roles.some((role) => allowedTeacherRoles(entity).includes(role))
    )
    const scopeFilters = buildAccessibleTeachingScopeFilters(scopedAssignments)

    if (scopeFilters.length > 0) {
      ;(where as Prisma.QuestionWhereInput).OR = [
        ...scopeFilters,
        { teacherId: profile.id },
      ] as Prisma.QuestionWhereInput[]
    } else {
      ;(where as Prisma.QuestionWhereInput).teacherId = profile.id
    }
  }

  if (entity === 'questions' || entity === 'question-options') {
    if (filters.departmentId) {
      ;(where as Prisma.QuestionWhereInput).subject = {
        departmentId: filters.departmentId,
      }
    }

    const questions = await prisma.question.findMany({
      where: where as Prisma.QuestionWhereInput,
      include: {
        translations: {
          where: activeTranslationRelationFilter,
        },
        options: {
          include: {
            translations: {
              where: activeTranslationRelationFilter,
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
        subject: true,
        language: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return questions
      .map((question) => {
        const selectedLanguageId = filters.languageId ?? question.languageId
        const translation = question.translations.find((entry) => entry.languageId === selectedLanguageId)
        const optionStates = question.options.map((option) => {
          const optionTranslation = option.translations.find(
            (entry) => entry.languageId === selectedLanguageId
          )

          return {
            id: option.id,
            text: optionTranslation?.text ?? '',
            orderIndex: option.orderIndex,
          }
        })

        const report = computeQuestionTranslationReport({
          languageId: selectedLanguageId,
          questionType: question.type,
          questionText: translation?.text ?? null,
          expectedAnswer: translation?.expectedAnswer ?? null,
          options: optionStates,
        })

        return {
          id: question.id,
          type: question.type,
          subjectName: question.subject.name,
          baseLanguageName: question.language.name,
          sourceText: question.text,
          preview: {
            ...resolveQuestionTranslation(question, selectedLanguageId),
            options: question.options.map((option) =>
              resolveQuestionOptionTranslation(option, selectedLanguageId)
            ),
          },
          completeness: report,
        }
      })
      .filter((item) => (filters.missingOnly ? !item.completeness.isComplete : true))
  }

  if (entity === 'exams') {
    if (filters.departmentId) {
      ;(where as Prisma.ExamWhereInput).departmentId = filters.departmentId
    }

    const exams = await prisma.exam.findMany({
      where: where as Prisma.ExamWhereInput,
      include: {
        translations: {
          where: activeTranslationRelationFilter,
        },
        subject: true,
        language: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return exams
      .map((exam) => {
        const selectedLanguageId = filters.languageId ?? exam.languageId
        const translation = exam.translations.find((entry) => entry.languageId === selectedLanguageId)
        const report = computeExamTranslationReport({
          languageId: selectedLanguageId,
          title: translation?.title ?? null,
          instructions: translation?.instructions ?? null,
        })

        return {
          id: exam.id,
          subjectName: exam.subject.name,
          baseLanguageName: exam.language.name,
          sourceTitle: exam.title,
          preview: resolveExamTranslation(exam, selectedLanguageId),
          completeness: report,
        }
      })
      .filter((item) => (filters.missingOnly ? !item.completeness.isComplete : true))
  }

  if (entity === 'coursework-rules') {
    if (filters.departmentId) {
      ;(where as Prisma.CourseworkRuleWhereInput).departmentId = filters.departmentId
    }

    const rules = await prisma.courseworkRule.findMany({
      where: where as Prisma.CourseworkRuleWhereInput,
      include: {
        translations: {
          where: activeTranslationRelationFilter,
        },
        subject: true,
        language: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return rules
      .map((rule) => {
        const selectedLanguageId = filters.languageId ?? rule.languageId
        const translation = rule.translations.find((entry) => entry.languageId === selectedLanguageId)
        const report = computeCourseworkRuleTranslationReport({
          languageId: selectedLanguageId,
          rules: translation?.rules ?? null,
        })

        return {
          id: rule.id,
          subjectName: rule.subject.name,
          baseLanguageName: rule.language.name,
          sourceRules: rule.rules,
          preview: resolveCourseworkRuleTranslation(rule, selectedLanguageId),
          completeness: report,
        }
      })
      .filter((item) => (filters.missingOnly ? !item.completeness.isComplete : true))
  }

  if (entity === 'coursework-assignments') {
    if (filters.departmentId) {
      ;(where as Prisma.CourseworkAssignmentWhereInput).departmentId = filters.departmentId
    }

    const assignments = await prisma.courseworkAssignment.findMany({
      where: where as Prisma.CourseworkAssignmentWhereInput,
      include: {
        translations: {
          where: activeTranslationRelationFilter,
        },
        student: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        subject: true,
        language: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return assignments
      .map((assignment) => {
        const selectedLanguageId = filters.languageId ?? assignment.languageId
        const translation = assignment.translations.find(
          (entry) => entry.languageId === selectedLanguageId
        )
        const report = computeCourseworkAssignmentTranslationReport({
          languageId: selectedLanguageId,
          title: translation?.title ?? null,
          rules: translation?.rules ?? null,
        })

        return {
          id: assignment.id,
          studentName: assignment.student.user.name,
          subjectName: assignment.subject.name,
          baseLanguageName: assignment.language.name,
          sourceTitle: assignment.title,
          preview: resolveCourseworkAssignmentTranslation(assignment, selectedLanguageId),
          completeness: report,
        }
      })
      .filter((item) => (filters.missingOnly ? !item.completeness.isComplete : true))
  }

  if (filters.departmentId) {
    ;(where as Prisma.EbookUploadWhereInput).departmentId = filters.departmentId
  }

  const ebooks = await prisma.ebookUpload.findMany({
    where: where as Prisma.EbookUploadWhereInput,
    include: {
      translations: {
        where: activeTranslationRelationFilter,
      },
      subject: true,
      language: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  return ebooks
    .map((ebook) => {
      const selectedLanguageId = filters.languageId ?? ebook.languageId
      const translation = ebook.translations.find((entry) => entry.languageId === selectedLanguageId)
      const report = computeEbookTranslationReport({
        languageId: selectedLanguageId,
        title: translation?.title ?? null,
        description: translation?.description ?? null,
        author: translation?.author ?? null,
        category: translation?.category ?? null,
      })

      return {
        id: ebook.id,
        subjectName: ebook.subject.name,
        baseLanguageName: ebook.language.name,
        sourceTitle: ebook.title,
        fileUrl: ebook.fileUrl,
        preview: resolveEbookTranslation(ebook, selectedLanguageId),
        completeness: report,
      }
    })
    .filter((item) => (filters.missingOnly ? !item.completeness.isComplete : true))
}

export function normalizeQuestionKeywords(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) {
    return serializeKeywords(value)
  }
  if (typeof value === 'string') {
    return serializeKeywords(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  }

  return null
}

export function previewQuestionTranslation(question: Awaited<ReturnType<typeof resolveTranslationParent>> & any, languageId: string) {
  return {
    ...resolveQuestionTranslation(question, languageId),
    keywords: parseKeywords(resolveQuestionTranslation(question, languageId).keywords),
    options: question.options.map((option: any) => resolveQuestionOptionTranslation(option, languageId)),
  }
}
