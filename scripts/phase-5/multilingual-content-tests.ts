import { PrismaClient } from '@prisma/client'
import { ensurePhase5EvidenceFixtures } from './evidence-fixtures.mjs'
import {
  validateExamPublication,
  validateQuestionPublication,
} from '@/lib/phase5-translations'

const prisma = new PrismaClient()

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const fixtures = await ensurePhase5EvidenceFixtures()

  const [completeQuestion, incompleteQuestion, completeExam, incompleteExam] = await Promise.all([
    prisma.question.findUniqueOrThrow({
      where: { id: fixtures.ids.question.english },
      include: {
        translations: true,
        options: {
          include: {
            translations: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    }),
    prisma.question.findUniqueOrThrow({
      where: { id: fixtures.ids.question.broken },
      include: {
        translations: true,
        options: {
          include: {
            translations: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    }),
    prisma.exam.findUniqueOrThrow({
      where: { id: fixtures.ids.exam.russian },
      include: {
        translations: true,
        questions: {
          include: {
            question: {
              include: {
                translations: true,
                options: {
                  include: {
                    translations: true,
                  },
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    }),
    prisma.exam.findUniqueOrThrow({
      where: { id: fixtures.ids.exam.broken },
      include: {
        translations: true,
        questions: {
          include: {
            question: {
              include: {
                translations: true,
                options: {
                  include: {
                    translations: true,
                  },
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    }),
  ])

  const completeQuestionPublication = validateQuestionPublication(
    completeQuestion,
    completeQuestion.languageId
  )
  const incompleteQuestionPublication = validateQuestionPublication(
    incompleteQuestion,
    incompleteQuestion.languageId
  )
  const completeExamPublication = validateExamPublication(completeExam, completeExam.languageId)
  const incompleteExamPublication = validateExamPublication(
    incompleteExam,
    incompleteExam.languageId
  )

  assert(
    completeQuestionPublication.canPublish,
    `Expected complete question publication to succeed, got ${JSON.stringify(completeQuestionPublication)}`
  )
  assert(
    !incompleteQuestionPublication.canPublish,
    'Expected incomplete question publication to be blocked'
  )
  assert(
    completeExamPublication.canPublish,
    `Expected complete exam publication to succeed, got ${JSON.stringify(completeExamPublication)}`
  )
  assert(
    !incompleteExamPublication.canPublish,
    'Expected incomplete exam publication to be blocked'
  )

  console.log('[phase-5] multilingual content tests passed')
}

main()
  .catch((error) => {
    console.error('[phase-5] multilingual content tests failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
