import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'

const evidencePath = path.join(process.cwd(), 'docs/phase-10/evidence/database/phase10-verify.json')

async function main() {
  const [
    courseCount,
    versionCount,
    sectionCount,
    lessonCount,
    materialCount,
    videoCount,
    liveClassCount,
    threadCount,
    replyCount,
    lessonProgressCount,
    videoProgressCount,
    attendanceCount,
    translationCount,
  ] = await Promise.all([
    prisma.phase10Course.count(),
    prisma.phase10CourseVersion.count(),
    prisma.phase10CourseSection.count(),
    prisma.phase10Lesson.count(),
    prisma.phase10LessonMaterial.count(),
    prisma.phase10VideoAsset.count(),
    prisma.phase10LiveClass.count(),
    prisma.phase10DiscussionThread.count(),
    prisma.phase10DiscussionReply.count(),
    prisma.phase10LessonProgress.count(),
    prisma.phase10VideoProgress.count(),
    prisma.phase10LiveClassAttendance.count(),
    prisma.phase10CourseTranslation.count(),
  ])

  const payload = {
    status:
      courseCount > 0 &&
      versionCount > 0 &&
      sectionCount > 0 &&
      lessonCount > 0 &&
      materialCount > 0 &&
      videoCount > 0 &&
      liveClassCount > 0 &&
      threadCount > 0 &&
      replyCount > 0 &&
      lessonProgressCount > 0 &&
      videoProgressCount > 0 &&
      attendanceCount > 0 &&
      translationCount > 0
        ? 'PASS'
        : 'BLOCKED',
    generatedAt: new Date().toISOString(),
    counts: {
      courseCount,
      versionCount,
      sectionCount,
      lessonCount,
      materialCount,
      videoCount,
      liveClassCount,
      threadCount,
      replyCount,
      lessonProgressCount,
      videoProgressCount,
      attendanceCount,
      translationCount,
    },
  }

  await fs.mkdir(path.dirname(evidencePath), { recursive: true })
  await fs.writeFile(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(payload, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  await prisma.$disconnect().catch(() => {})
})
