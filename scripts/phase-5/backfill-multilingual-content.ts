import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type Mode = 'dry-run' | 'apply'

function getMode(): Mode {
  return process.argv.includes('--apply') ? 'apply' : 'dry-run'
}

async function backfillExamTranslations(mode: Mode) {
  const exams = await prisma.exam.findMany({
    include: {
      translations: true,
    },
  })

  let created = 0
  for (const exam of exams) {
    const exists = exam.translations.some((translation) => translation.languageId === exam.languageId)
    if (exists) {
      continue
    }

    created += 1
    if (mode === 'apply') {
      await prisma.examTranslation.create({
        data: {
          examId: exam.id,
          languageId: exam.languageId,
          title: exam.title,
          description: exam.description,
          instructions: exam.instructions,
        },
      })
    }
  }

  return { scanned: exams.length, created }
}

async function backfillQuestionTranslations(mode: Mode) {
  const questions = await prisma.question.findMany({
    include: {
      translations: true,
      options: {
        include: {
          translations: true,
        },
      },
    },
  })

  let questionTranslationsCreated = 0
  let optionTranslationsCreated = 0

  for (const question of questions) {
    const questionExists = question.translations.some(
      (translation) => translation.languageId === question.languageId
    )
    if (!questionExists) {
      questionTranslationsCreated += 1
      if (mode === 'apply') {
        await prisma.questionTranslation.create({
          data: {
            questionId: question.id,
            languageId: question.languageId,
            text: question.text,
            expectedAnswer: question.expectedAnswer,
            explanation: question.explanation,
            keywords: question.keywords,
          },
        })
      }
    }

    for (const option of question.options) {
      const optionExists = option.translations.some(
        (translation) => translation.languageId === question.languageId
      )
      if (optionExists) {
        continue
      }

      optionTranslationsCreated += 1
      if (mode === 'apply') {
        await prisma.questionOptionTranslation.create({
          data: {
            questionOptionId: option.id,
            languageId: question.languageId,
            text: option.text,
          },
        })
      }
    }
  }

  return {
    scanned: questions.length,
    questionTranslationsCreated,
    optionTranslationsCreated,
  }
}

async function backfillCourseworkRuleTranslations(mode: Mode) {
  const rules = await prisma.courseworkRule.findMany({
    include: {
      translations: true,
    },
  })

  let created = 0
  for (const rule of rules) {
    const exists = rule.translations.some((translation) => translation.languageId === rule.languageId)
    if (exists) {
      continue
    }

    created += 1
    if (mode === 'apply') {
      await prisma.courseworkRuleTranslation.create({
        data: {
          ruleId: rule.id,
          languageId: rule.languageId,
          rules: rule.rules,
        },
      })
    }
  }

  return { scanned: rules.length, created }
}

async function backfillCourseworkAssignmentTranslations(mode: Mode) {
  const assignments = await prisma.courseworkAssignment.findMany({
    include: {
      translations: true,
    },
  })

  let created = 0
  for (const assignment of assignments) {
    const exists = assignment.translations.some(
      (translation) => translation.languageId === assignment.languageId
    )
    if (exists) {
      continue
    }

    created += 1
    if (mode === 'apply') {
      await prisma.courseworkAssignmentTranslation.create({
        data: {
          assignmentId: assignment.id,
          languageId: assignment.languageId,
          title: assignment.title,
          rules: assignment.rules,
        },
      })
    }
  }

  return { scanned: assignments.length, created }
}

async function backfillEbookTranslations(mode: Mode) {
  const ebooks = await prisma.ebookUpload.findMany({
    include: {
      translations: true,
    },
  })

  let created = 0
  for (const ebook of ebooks) {
    const exists = ebook.translations.some((translation) => translation.languageId === ebook.languageId)
    if (exists) {
      continue
    }

    created += 1
    if (mode === 'apply') {
      await prisma.ebookUploadTranslation.create({
        data: {
          ebookUploadId: ebook.id,
          languageId: ebook.languageId,
          title: ebook.title,
          description: ebook.description,
        },
      })
    }
  }

  return { scanned: ebooks.length, created }
}

async function main() {
  const mode = getMode()

  console.log(`[phase-5] multilingual content backfill mode: ${mode}`)

  const examSummary = await backfillExamTranslations(mode)
  const questionSummary = await backfillQuestionTranslations(mode)
  const courseworkRuleSummary = await backfillCourseworkRuleTranslations(mode)
  const courseworkAssignmentSummary = await backfillCourseworkAssignmentTranslations(mode)
  const ebookSummary = await backfillEbookTranslations(mode)

  console.log(JSON.stringify({
    exams: examSummary,
    questions: questionSummary,
    courseworkRules: courseworkRuleSummary,
    courseworkAssignments: courseworkAssignmentSummary,
    ebooks: ebookSummary,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error('[phase-5] backfill failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
