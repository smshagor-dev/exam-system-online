import fs from 'node:fs/promises'
import path from 'node:path'
import {
  Phase10DiscussionThreadStatus,
  Phase10LessonType,
  Phase10LiveAttendanceStatus,
  Phase10LiveClassProvider,
  Phase10MaterialType,
  Phase10VideoSourceType,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  buildPhase10ProgressSummary,
  createPhase10Course,
  createPhase10DiscussionReply,
  createPhase10DiscussionThread,
  createPhase10VideoAsset,
  joinPhase10LiveClass,
  moderatePhase10DiscussionThread,
  publishPhase10Lesson,
  recordPhase10LessonProgress,
  recordPhase10VideoProgress,
  schedulePhase10LiveClass,
  uploadPhase10LessonMaterial,
} from '@/lib/phase10-lms'
import { ensurePhase10Fixtures } from './fixtures'

const evidencePath = path.join(process.cwd(), 'docs/phase-10/evidence/database/phase10-platform-tests.json')

async function main() {
  const fixtures = await ensurePhase10Fixtures()
  const suffix = Date.now()

  const course = await createPhase10Course({
    departmentId: fixtures.departments.cse.id,
    programId: fixtures.offering.programId,
    academicOfferingId: fixtures.offering.id,
    subjectId: fixtures.offering.subjectId,
    semesterId: fixtures.offering.semesterId,
    groupId: fixtures.offering.groupId,
    languageId: fixtures.offering.languageId,
    code: `P10-${suffix}`,
    title: `Phase 10 Platform Course ${suffix}`,
    summary: 'Enterprise LMS end-to-end validation course.',
    credits: 3,
    outcomes: [
      {
        title: 'Understand LMS delivery flow',
        description: 'Validate course, materials, video, live class, and progress orchestration.',
      },
    ],
    prerequisites: [
      {
        prerequisiteSubjectId: fixtures.offering.subjectId,
        title: `Prerequisite for ${fixtures.offering.subject.name}`,
        minimumGrade: 'C',
      },
    ],
    translations: [
      {
        languageId: fixtures.offering.languageId,
        title: `Phase 10 Platform Course ${suffix}`,
        summary: 'Localized LMS summary.',
      },
    ],
    version: {
      title: 'Version 1.0',
      syllabus: 'Phase 10 LMS syllabus coverage.',
      changeLog: 'Initial automated validation version.',
      sections: [
        {
          title: 'Foundations',
          summary: 'Course foundation section.',
          lessons: [
            {
              title: 'Published Video Lesson',
              summary: 'Tests materials, streaming, and progress.',
              type: Phase10LessonType.VIDEO,
              estimatedMinutes: 35,
              richText: '<p>Video lesson content</p>',
              translations: [
                {
                  languageId: fixtures.offering.languageId,
                  title: 'Published Video Lesson',
                  summary: 'Localized lesson summary.',
                  richText: '<p>Localized lesson content</p>',
                },
              ],
            },
          ],
        },
      ],
    },
  })

  const lesson = course.versions[0]?.sections[0]?.lessons[0]
  if (!lesson) {
    throw new Error('Platform test lesson was not created')
  }

  const material = await uploadPhase10LessonMaterial(
    lesson.id,
    {
      type: Phase10MaterialType.PDF,
      title: 'Phase 10 LMS Guide',
      description: 'Uploaded material for LMS validation.',
      sortOrder: 1,
      translations: [
        {
          languageId: fixtures.offering.languageId,
          title: 'Phase 10 LMS Guide',
          description: 'Localized material description.',
        },
      ],
    },
    {
      name: 'phase10-guide.pdf',
      type: 'application/pdf',
      buffer: Buffer.from('phase10 material payload', 'utf8'),
    }
  )

  const video = await createPhase10VideoAsset(
    lesson.id,
    {
      title: 'Phase 10 Walkthrough',
      sourceType: Phase10VideoSourceType.UPLOAD,
      durationSeconds: 600,
      thumbnailUrl: 'https://example.com/phase10-thumb.png',
    },
    {
      name: 'phase10-video.mp4',
      type: 'video/mp4',
      buffer: Buffer.from('phase10 video payload', 'utf8'),
    }
  )

  const publishedLesson = await publishPhase10Lesson(lesson.id)
  const liveClass = await schedulePhase10LiveClass(lesson.id, {
    provider: Phase10LiveClassProvider.JITSI,
    title: 'Phase 10 Live Session',
    description: 'Live class for LMS validation.',
    startAt: new Date(Date.now() + 60 * 60 * 1000),
    endAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    joinUrl: 'https://meet.jit.si/phase10-platform-test',
    hostUrl: 'https://meet.jit.si/phase10-platform-test?host=true',
    meetingCode: `P10-${suffix}`,
    recordingUrl: 'https://example.com/phase10-recording',
    calendarSyncToken: `phase10-${suffix}`,
  })

  const firstProgress = await recordPhase10VideoProgress(video.id, fixtures.student.id, {
    lastPositionSeconds: 180,
    watchedSecondsDelta: 180,
    durationSeconds: 600,
  })
  const resumedProgress = await recordPhase10VideoProgress(video.id, fixtures.student.id, {
    lastPositionSeconds: 540,
    watchedSecondsDelta: 360,
    durationSeconds: 600,
  })

  const lessonProgress = await recordPhase10LessonProgress(lesson.id, fixtures.student.id, {
    completionPercent: 90,
    readingProgressPercent: 100,
    watchProgressPercent: resumedProgress.watchedPercentage,
    assignmentCompleted: true,
    quizCompleted: true,
  })

  const attendance = await joinPhase10LiveClass(liveClass.id, fixtures.student.id, {
    status: Phase10LiveAttendanceStatus.ATTENDED,
    joinedAt: new Date(Date.now() + 65 * 60 * 1000),
    leftAt: new Date(Date.now() + 115 * 60 * 1000),
  })

  const thread = await createPhase10DiscussionThread(fixtures.student.user.id, {
    courseId: course.id,
    lessonId: lesson.id,
    title: 'How does playback resume work?',
    body: 'Testing the discussion flow for the enterprise LMS.',
  })
  const reply = await createPhase10DiscussionReply(thread.id, fixtures.student.user.id, 'Resume playback persists correctly.')
  const moderated = await moderatePhase10DiscussionThread(
    thread.id,
    {
      status: Phase10DiscussionThreadStatus.OPEN,
      isPinned: true,
    },
    fixtures.teacher.user.id
  )

  const studentCourseList = await prisma.phase10Course.findMany({
    where: {
      id: course.id,
      isPublished: true,
    },
    include: {
      lessons: true,
      discussionThreads: true,
    },
  })
  const studentCourseDetail = await prisma.phase10Course.findUniqueOrThrow({
    where: { id: course.id },
    include: {
      lessons: {
        include: {
          materials: true,
          videoAssets: true,
          liveClasses: true,
          discussionThreads: {
            include: { replies: true },
          },
        },
      },
    },
  })
  const progressSummary = await buildPhase10ProgressSummary(course.id, fixtures.student.id)

  const payload = {
    status:
      material.id &&
      video.id &&
      publishedLesson.isPublished &&
      liveClass.id &&
      firstProgress.id &&
      resumedProgress.resumeCount >= 2 &&
      lessonProgress.assignmentCompleted &&
      attendance.status === Phase10LiveAttendanceStatus.ATTENDED &&
      moderated.isPinned &&
      studentCourseList.length === 1 &&
      studentCourseDetail.lessons[0]?.materials.length > 0 &&
      progressSummary.completedLessons >= 1
        ? 'PASS'
        : 'BLOCKED',
    generatedAt: new Date().toISOString(),
    course: {
      id: course.id,
      code: course.code,
      versionId: course.versions[0]?.id ?? null,
      lessonId: lesson.id,
      published: publishedLesson.isPublished,
    },
    materials: {
      materialId: material.id,
      videoId: video.id,
      liveClassId: liveClass.id,
    },
    progress: {
      firstWatchPercent: firstProgress.watchedPercentage,
      resumedWatchPercent: resumedProgress.watchedPercentage,
      resumeCount: resumedProgress.resumeCount,
      lessonProgressId: lessonProgress.id,
      attendanceId: attendance.id,
      summary: progressSummary,
    },
    discussion: {
      threadId: thread.id,
      replyId: reply.id,
      pinned: moderated.isPinned,
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
