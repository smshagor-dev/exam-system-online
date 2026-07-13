import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const [exams, questions, courseworkRules, courseworkAssignments, ebooks] = await Promise.all([
    prisma.exam.findMany({
      include: {
        translations: true,
      },
    }),
    prisma.question.findMany({
      include: {
        translations: true,
        options: {
          include: {
            translations: true,
          },
        },
      },
    }),
    prisma.courseworkRule.findMany({
      include: {
        translations: true,
      },
    }),
    prisma.courseworkAssignment.findMany({
      include: {
        translations: true,
      },
    }),
    prisma.ebookUpload.findMany({
      include: {
        translations: true,
      },
    }),
  ])

  const errors: string[] = []
  const isIntentionalBrokenFixture = (value: string | null | undefined) =>
    typeof value === 'string' && value.startsWith('P5 Evidence Broken')

  for (const exam of exams) {
    if (isIntentionalBrokenFixture(exam.title)) {
      continue
    }

    if (!exam.translations.some((translation) => translation.languageId === exam.languageId)) {
      errors.push(`Exam ${exam.id} is missing base translation for ${exam.languageId}`)
    }
  }

  for (const question of questions) {
    if (isIntentionalBrokenFixture(question.text)) {
      continue
    }

    if (!question.translations.some((translation) => translation.languageId === question.languageId)) {
      errors.push(`Question ${question.id} is missing base translation for ${question.languageId}`)
    }

    for (const option of question.options) {
      if (!option.translations.some((translation) => translation.languageId === question.languageId)) {
        errors.push(`Question option ${option.id} is missing base translation for ${question.languageId}`)
      }
    }
  }

  for (const rule of courseworkRules) {
    if (isIntentionalBrokenFixture(rule.rules)) {
      continue
    }

    if (!rule.translations.some((translation) => translation.languageId === rule.languageId)) {
      errors.push(`Coursework rule ${rule.id} is missing base translation for ${rule.languageId}`)
    }
  }

  for (const assignment of courseworkAssignments) {
    if (isIntentionalBrokenFixture(assignment.title)) {
      continue
    }

    if (!assignment.translations.some((translation) => translation.languageId === assignment.languageId)) {
      errors.push(`Coursework assignment ${assignment.id} is missing base translation for ${assignment.languageId}`)
    }
  }

  for (const ebook of ebooks) {
    if (isIntentionalBrokenFixture(ebook.title)) {
      continue
    }

    if (!ebook.translations.some((translation) => translation.languageId === ebook.languageId)) {
      errors.push(`Ebook ${ebook.id} is missing base translation for ${ebook.languageId}`)
    }
  }

  if (errors.length > 0) {
    console.error('[phase-5] verification failed')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log('[phase-5] multilingual content verification passed')
  console.log(JSON.stringify({
    exams: exams.length,
    questions: questions.length,
    courseworkRules: courseworkRules.length,
    courseworkAssignments: courseworkAssignments.length,
    ebooks: ebooks.length,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error('[phase-5] verification failed unexpectedly', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
