import { prisma } from '../../src/lib/prisma'

async function main() {
  const [
    attempts,
    grades,
    publicationTargets,
    templateCount,
    publicationCount,
  ] = await Promise.all([
    prisma.courseworkAttempt.findMany({
      select: {
        id: true,
        publicationId: true,
      },
    }),
    prisma.courseworkGrade.findMany({
      select: {
        id: true,
        attemptId: true,
        publicationId: true,
      },
    }),
    prisma.courseworkPublicationTarget.findMany({
      select: {
        publicationId: true,
        studentId: true,
      },
    }),
    prisma.courseworkTemplate.count(),
    prisma.courseworkPublication.count(),
  ])

  const publicationIds = new Set(
    (
      await prisma.courseworkPublication.findMany({
        select: { id: true },
      })
    ).map((item) => item.id)
  )
  const attemptIds = new Set(attempts.map((item) => item.id))
  const seenTargetKeys = new Set<string>()
  const duplicateTargetGroups = publicationTargets.filter((target) => {
    const key = `${target.publicationId}:${target.studentId}`
    if (seenTargetKeys.has(key)) {
      return true
    }
    seenTargetKeys.add(key)
    return false
  })

  const orphanAttempts = attempts.filter((attempt) => !publicationIds.has(attempt.publicationId))
  const orphanGrades = grades.filter(
    (grade) => !publicationIds.has(grade.publicationId) || !attemptIds.has(grade.attemptId)
  )

  if (orphanAttempts.length > 0) {
    throw new Error(`Found ${orphanAttempts.length} orphan coursework attempts`)
  }
  if (orphanGrades.length > 0) {
    throw new Error(`Found ${orphanGrades.length} orphan coursework grades`)
  }
  if (duplicateTargetGroups.length > 0) {
    throw new Error(`Found ${duplicateTargetGroups.length} duplicate publication targets`)
  }

  console.log('[phase7:verify] PASS')
  console.log(
    JSON.stringify(
      {
        templateCount,
        publicationCount,
        orphanAttempts: orphanAttempts.length,
        orphanGrades: orphanGrades.length,
        duplicateTargetGroups: duplicateTargetGroups.length,
      },
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error('[phase7:verify] FAIL', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
