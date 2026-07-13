import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CourseworkPublicationStatus,
  CourseworkAttemptStatus,
  Phase8AttendanceStatus,
  Phase10DiscussionThreadStatus,
  Phase10LiveAttendanceStatus,
  Phase10LiveClassProvider,
  Phase10MaterialType,
  Prisma,
  Phase10VideoSourceType,
} from '@prisma/client'
import { findTranslation } from './academic-content'
import { sanitizeRichHtml } from './safe-html'
import { prisma } from './prisma'
import { sanitizePhase10FileName } from './phase10-upload-security'

const PHASE10_STORAGE_DIR = path.join(process.cwd(), '.generated', 'phase-10')
const PHASE10_MATERIAL_DIR = path.join(PHASE10_STORAGE_DIR, 'materials')
const PHASE10_VIDEO_DIR = path.join(PHASE10_STORAGE_DIR, 'videos')

function safeName(value: string) {
  return sanitizePhase10FileName(value)
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true })
}

function buildWatchHistoryEntry(position: number, watchedSeconds: number): Prisma.InputJsonObject {
  return {
    at: new Date().toISOString(),
    position,
    watchedSeconds,
  }
}

async function saveBinaryAsset(targetDir: string, originalName: string, buffer: Buffer) {
  await ensureDir(targetDir)
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName(originalName)}`
  const filePath = path.join(targetDir, fileName)
  await fs.writeFile(filePath, buffer)
  return {
    fileName,
    filePath,
    fileUrl: filePath,
  }
}

async function getOfferingStudentUserIds(academicOfferingId: string | null | undefined) {
  if (!academicOfferingId) {
    return []
  }

  const rows = await prisma.studentSubject.findMany({
    where: { academicOfferingId },
    select: {
      student: {
        select: {
          userId: true,
        },
      },
    },
  })

  return [...new Set(rows.map((row) => row.student.userId))]
}

async function createNotificationsForUsers(
  userIds: string[],
  payload: {
    title: string
    message: string
    link: string
    type?: string
  }
) {
  for (const userId of userIds) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        title: payload.title,
        link: payload.link,
      },
      select: { id: true },
    })

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId,
          title: payload.title,
          message: payload.message,
          link: payload.link,
          type: payload.type ?? 'info',
        },
      })
    }
  }
}

function resolveCourseTranslation<T extends { languageId: string; title: string; summary?: string | null; translations?: Array<{ languageId: string; title: string; summary?: string | null }> }>(
  course: T,
  languageId = course.languageId
) {
  const translation = findTranslation(course.translations, languageId)
  return {
    ...course,
    title: translation?.title ?? course.title,
    summary: translation?.summary ?? course.summary ?? null,
  }
}

function resolveLessonTranslation<T extends { title: string; summary?: string | null; richText?: string | null; translations?: Array<{ languageId: string; title: string; summary?: string | null; richText?: string | null }> }>(
  lesson: T,
  languageId: string
) {
  const translation = findTranslation(lesson.translations, languageId)
  return {
    ...lesson,
    title: translation?.title ?? lesson.title,
    summary: translation?.summary ?? lesson.summary ?? null,
    richText: translation?.richText ?? lesson.richText ?? null,
  }
}

function resolveMaterialTranslation<T extends { title: string; description?: string | null; richText?: string | null; translations?: Array<{ languageId: string; title: string; description?: string | null; richText?: string | null }> }>(
  material: T,
  languageId: string
) {
  const translation = findTranslation(material.translations, languageId)
  return {
    ...material,
    title: translation?.title ?? material.title,
    description: translation?.description ?? material.description ?? null,
    richText: translation?.richText ?? material.richText ?? null,
  }
}

async function getStudentCourseContext(studentUserId: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: {
      id: true,
      userId: true,
      departmentId: true,
      subjects: {
        select: {
          academicOfferingId: true,
          subjectId: true,
          languageId: true,
          groupId: true,
          academicYearId: true,
          semesterId: true,
        },
      },
    },
  })

  return profile
}

async function syncLessonProgressFromVideo(lessonId: string, studentId: string) {
  const progressRows = await prisma.phase10VideoProgress.findMany({
    where: {
      lessonId,
      studentId,
    },
    select: {
      watchedPercentage: true,
      completedAt: true,
    },
  })

  const maxWatch = progressRows.reduce((max, row) => Math.max(max, row.watchedPercentage), 0)
  const completed = progressRows.some((row) => Boolean(row.completedAt)) || maxWatch >= 95

  return prisma.phase10LessonProgress.upsert({
    where: {
      lessonId_studentId: {
        lessonId,
        studentId,
      },
    },
    create: {
      lessonId,
      studentId,
      completionPercent: completed ? 100 : maxWatch,
      watchProgressPercent: maxWatch,
      isCompleted: completed,
      completedAt: completed ? new Date() : null,
    },
    update: {
      completionPercent: completed ? 100 : maxWatch,
      watchProgressPercent: maxWatch,
      isCompleted: completed,
      completedAt: completed ? new Date() : null,
    },
  })
}

export async function createPhase10Course(input: {
  departmentId: string
  programId?: string | null
  academicOfferingId?: string | null
  subjectId: string
  semesterId: string
  groupId?: string | null
  languageId: string
  code: string
  title: string
  summary?: string | null
  credits?: number | null
  outcomes?: Array<{ title: string; description?: string | null; sortOrder?: number }>
  prerequisites?: Array<{
    prerequisiteSubjectId?: string | null
    title?: string | null
    minimumGrade?: string | null
    notes?: string | null
    sortOrder?: number
  }>
  translations?: Array<{ languageId: string; title: string; summary?: string | null }>
  version: {
    title: string
    syllabus?: string | null
    changeLog?: string | null
    sections: Array<{
      title: string
      summary?: string | null
      sortOrder?: number
      lessons: Array<{
        title: string
        summary?: string | null
        type: string
        estimatedMinutes?: number | null
        richText?: string | null
        sortOrder?: number
        translations?: Array<{ languageId: string; title: string; summary?: string | null; richText?: string | null }>
      }>
    }>
  }
}) {
  const createdId = await prisma.$transaction(async (tx) => {
    const course = await tx.phase10Course.create({
      data: {
        departmentId: input.departmentId,
        programId: input.programId ?? null,
        academicOfferingId: input.academicOfferingId ?? null,
        subjectId: input.subjectId,
        semesterId: input.semesterId,
        groupId: input.groupId ?? null,
        languageId: input.languageId,
        code: input.code,
        title: input.title,
        summary: input.summary ?? null,
        credits: input.credits ?? null,
      },
    })

    if ((input.outcomes ?? []).length > 0) {
      await Promise.all(
        (input.outcomes ?? []).map((outcome, index) =>
          tx.phase10CourseOutcome.create({
            data: {
              courseId: course.id,
              title: outcome.title,
              description: outcome.description ?? null,
              sortOrder: outcome.sortOrder ?? index,
            },
          })
        )
      )
    }

    if ((input.prerequisites ?? []).length > 0) {
      await Promise.all(
        (input.prerequisites ?? []).map((item, index) =>
          tx.phase10CoursePrerequisite.create({
            data: {
              courseId: course.id,
              prerequisiteSubjectId: item.prerequisiteSubjectId ?? null,
              title: item.title ?? null,
              minimumGrade: item.minimumGrade ?? null,
              notes: item.notes ?? null,
              sortOrder: item.sortOrder ?? index,
            },
          })
        )
      )
    }

    if ((input.translations ?? []).length > 0) {
      await Promise.all(
        (input.translations ?? []).map((translation) =>
          tx.phase10CourseTranslation.create({
            data: {
              courseId: course.id,
              languageId: translation.languageId,
              title: translation.title,
              summary: translation.summary ?? null,
            },
          })
        )
      )
    }

    const version = await tx.phase10CourseVersion.create({
      data: {
        courseId: course.id,
        versionNumber: 1,
        title: input.version.title,
        syllabus: input.version.syllabus ?? null,
        changeLog: input.version.changeLog ?? null,
      },
    })

    for (const [sectionIndex, section] of input.version.sections.entries()) {
      const createdSection = await tx.phase10CourseSection.create({
        data: {
          versionId: version.id,
          title: section.title,
          summary: section.summary ?? null,
          sortOrder: section.sortOrder ?? sectionIndex,
        },
      })

      for (const [lessonIndex, lesson] of section.lessons.entries()) {
        const createdLesson = await tx.phase10Lesson.create({
          data: {
            courseId: course.id,
            sectionId: createdSection.id,
            title: lesson.title,
            summary: lesson.summary ?? null,
            type: lesson.type as never,
            estimatedMinutes: lesson.estimatedMinutes ?? null,
            richText: lesson.richText ?? null,
            sortOrder: lesson.sortOrder ?? lessonIndex,
          },
        })

        if ((lesson.translations ?? []).length > 0) {
          await Promise.all(
            (lesson.translations ?? []).map((translation) =>
              tx.phase10LessonTranslation.create({
                data: {
                  lessonId: createdLesson.id,
                  languageId: translation.languageId,
                  title: translation.title,
                  summary: translation.summary ?? null,
                  richText: translation.richText ?? null,
                },
              })
            )
          )
        }
      }
    }

    await tx.phase10Course.update({
      where: { id: course.id },
      data: {
        currentVersionId: version.id,
      },
    })

    return course.id
  })

  return prisma.phase10Course.findUniqueOrThrow({
    where: { id: createdId },
    include: {
      versions: {
        include: {
          sections: {
            include: {
              lessons: {
                include: {
                  materials: true,
                  videoAssets: true,
                  liveClasses: true,
                  translations: true,
                },
              },
            },
          },
        },
      },
      outcomes: true,
      prerequisites: {
        include: {
          prerequisiteSubject: true,
        },
      },
      translations: true,
    },
  })
}

export async function uploadPhase10LessonMaterial(
  lessonId: string,
  input: {
    type: Phase10MaterialType
    title: string
    description?: string | null
    externalUrl?: string | null
    richText?: string | null
    scormManifestUrl?: string | null
    scormLaunchUrl?: string | null
    sortOrder?: number
    translations?: Array<{ languageId: string; title: string; description?: string | null; richText?: string | null }>
  },
  file?: {
    name: string
    type: string
    buffer: Buffer
  }
) {
  let stored: { fileName?: string; fileUrl?: string; sizeBytes?: number; mimeType?: string } = {}

  if (file) {
    const saved = await saveBinaryAsset(PHASE10_MATERIAL_DIR, file.name, file.buffer)
    stored = {
      fileName: safeName(file.name),
      fileUrl: saved.filePath,
      sizeBytes: file.buffer.byteLength,
      mimeType: file.type || 'application/octet-stream',
    }
  }

  return prisma.phase10LessonMaterial.create({
    data: {
      lessonId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      externalUrl: input.externalUrl ?? null,
      richText: sanitizeRichHtml(input.richText) || null,
      scormManifestUrl: input.scormManifestUrl ?? null,
      scormLaunchUrl: input.scormLaunchUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
      fileName: stored.fileName ?? null,
      fileUrl: stored.fileUrl ?? null,
      sizeBytes: stored.sizeBytes ?? null,
      mimeType: stored.mimeType ?? null,
      isPublished: false,
      translations: {
        create: (input.translations ?? []).map((translation) => ({
          languageId: translation.languageId,
          title: translation.title,
          description: translation.description ?? null,
          richText: sanitizeRichHtml(translation.richText) || null,
        })),
      },
    },
    include: {
      translations: true,
    },
  })
}

export async function createPhase10VideoAsset(
  lessonId: string,
  input: {
    title: string
    sourceType: Phase10VideoSourceType
    externalUrl?: string | null
    streamingUrl?: string | null
    durationSeconds?: number
    thumbnailUrl?: string | null
  },
  file?: {
    name: string
    type: string
    buffer: Buffer
  }
) {
  let stored: { fileName?: string; fileUrl?: string } = {}

  if (file) {
    const saved = await saveBinaryAsset(PHASE10_VIDEO_DIR, file.name, file.buffer)
    stored = {
      fileName: safeName(file.name),
      fileUrl: saved.filePath,
    }
  }

  return prisma.phase10VideoAsset.create({
    data: {
      lessonId,
      title: input.title,
      sourceType: input.sourceType,
      externalUrl: input.externalUrl ?? null,
      streamingUrl: input.streamingUrl ?? null,
      durationSeconds: input.durationSeconds ?? 0,
      thumbnailUrl: input.thumbnailUrl ?? null,
      fileName: stored.fileName ?? null,
      fileUrl: stored.fileUrl ?? null,
      isPublished: false,
    },
  })
}

export async function publishPhase10Lesson(lessonId: string) {
  const lesson = await prisma.phase10Lesson.update({
    where: { id: lessonId },
    data: {
      isPublished: true,
      publishedAt: new Date(),
    },
    include: {
      course: true,
    },
  })

  await prisma.phase10Course.update({
    where: { id: lesson.courseId },
    data: {
      status: 'PUBLISHED',
      isPublished: true,
      publishedAt: new Date(),
    },
  })

  const userIds = await getOfferingStudentUserIds(lesson.course.academicOfferingId)
  await createNotificationsForUsers(userIds, {
    title: 'LMS Lesson Published',
    message: `A new lesson is available: ${lesson.title}`,
    link: `/student/lms/${lesson.courseId}`,
    type: 'info',
  })

  return lesson
}

export async function schedulePhase10LiveClass(
  lessonId: string,
  input: {
    provider: Phase10LiveClassProvider
    title: string
    description?: string | null
    startAt: Date
    endAt: Date
    joinUrl: string
    hostUrl?: string | null
    meetingCode?: string | null
    passcode?: string | null
    recordingUrl?: string | null
    calendarSyncToken?: string | null
  }
) {
  const liveClass = await prisma.phase10LiveClass.create({
    data: {
      lessonId,
      provider: input.provider,
      title: input.title,
      description: input.description ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      joinUrl: input.joinUrl,
      hostUrl: input.hostUrl ?? null,
      meetingCode: input.meetingCode ?? null,
      passcode: input.passcode ?? null,
      recordingUrl: input.recordingUrl ?? null,
      calendarSyncToken: input.calendarSyncToken ?? null,
      isPublished: true,
      publishedAt: new Date(),
    },
    include: {
      lesson: {
        include: {
          course: true,
        },
      },
    },
  })

  const userIds = await getOfferingStudentUserIds(liveClass.lesson.course.academicOfferingId)
  await createNotificationsForUsers(userIds, {
    title: 'LMS Live Class Scheduled',
    message: `A live class was scheduled: ${liveClass.title}`,
    link: `/student/lms/${liveClass.lesson.courseId}`,
    type: 'info',
  })

  return liveClass
}

export async function recordPhase10VideoProgress(
  videoAssetId: string,
  studentId: string,
  input: {
    lastPositionSeconds: number
    watchedSecondsDelta?: number
    durationSeconds?: number | null
  }
) {
  const video = await prisma.phase10VideoAsset.findUnique({
    where: { id: videoAssetId },
    select: {
      id: true,
      lessonId: true,
      durationSeconds: true,
    },
  })

  if (!video) {
    throw new Error('Video asset not found')
  }

  const duration = input.durationSeconds ?? video.durationSeconds
  const existing = await prisma.phase10VideoProgress.findUnique({
    where: {
      videoAssetId_studentId: {
        videoAssetId,
        studentId,
      },
    },
  })

  const watchedSeconds = Math.max((existing?.watchedSeconds ?? 0) + (input.watchedSecondsDelta ?? 0), input.lastPositionSeconds)
  const watchedPercentage = duration > 0 ? Math.min(100, Number(((watchedSeconds / duration) * 100).toFixed(2))) : 0
  const completed = watchedPercentage >= 95
  const nextWatchHistory = [
    ...((Array.isArray(existing?.watchHistory) ? existing?.watchHistory : []) as Prisma.InputJsonValue[]),
    buildWatchHistoryEntry(input.lastPositionSeconds, watchedSeconds),
  ] as Prisma.InputJsonArray

  const progress = await prisma.phase10VideoProgress.upsert({
    where: {
      videoAssetId_studentId: {
        videoAssetId,
        studentId,
      },
    },
    create: {
      videoAssetId,
      lessonId: video.lessonId,
      studentId,
      lastPositionSeconds: input.lastPositionSeconds,
      watchedSeconds,
      watchedPercentage,
      resumeCount: input.lastPositionSeconds > 0 ? 1 : 0,
      lastWatchedAt: new Date(),
      completedAt: completed ? new Date() : null,
      watchHistory: [buildWatchHistoryEntry(input.lastPositionSeconds, watchedSeconds)] as Prisma.InputJsonArray,
    },
    update: {
      lastPositionSeconds: input.lastPositionSeconds,
      watchedSeconds,
      watchedPercentage,
      resumeCount: (existing?.resumeCount ?? 0) + (input.lastPositionSeconds > 0 ? 1 : 0),
      lastWatchedAt: new Date(),
      completedAt: completed ? new Date() : null,
      watchHistory: nextWatchHistory,
    },
  })

  await syncLessonProgressFromVideo(video.lessonId, studentId)
  return progress
}

export async function recordPhase10LessonProgress(
  lessonId: string,
  studentId: string,
  input: {
    completionPercent?: number
    readingProgressPercent?: number
    watchProgressPercent?: number
    assignmentCompleted?: boolean
    attendanceCompleted?: boolean
    quizCompleted?: boolean
    isCompleted?: boolean
  }
) {
  const existing = await prisma.phase10LessonProgress.findUnique({
    where: {
      lessonId_studentId: {
        lessonId,
        studentId,
      },
    },
  })

  const completionPercent = input.completionPercent ?? existing?.completionPercent ?? 0
  const isCompleted = input.isCompleted ?? existing?.isCompleted ?? completionPercent >= 100

  return prisma.phase10LessonProgress.upsert({
    where: {
      lessonId_studentId: {
        lessonId,
        studentId,
      },
    },
    create: {
      lessonId,
      studentId,
      completionPercent,
      readingProgressPercent: input.readingProgressPercent ?? 0,
      watchProgressPercent: input.watchProgressPercent ?? 0,
      assignmentCompleted: input.assignmentCompleted ?? false,
      attendanceCompleted: input.attendanceCompleted ?? false,
      quizCompleted: input.quizCompleted ?? false,
      isCompleted,
      completedAt: isCompleted ? new Date() : null,
    },
    update: {
      completionPercent,
      readingProgressPercent: input.readingProgressPercent ?? existing?.readingProgressPercent ?? 0,
      watchProgressPercent: input.watchProgressPercent ?? existing?.watchProgressPercent ?? 0,
      assignmentCompleted: input.assignmentCompleted ?? existing?.assignmentCompleted ?? false,
      attendanceCompleted: input.attendanceCompleted ?? existing?.attendanceCompleted ?? false,
      quizCompleted: input.quizCompleted ?? existing?.quizCompleted ?? false,
      isCompleted,
      completedAt: isCompleted ? new Date() : existing?.completedAt ?? null,
    },
  })
}

export async function joinPhase10LiveClass(
  liveClassId: string,
  studentId: string,
  input?: {
    status?: Phase10LiveAttendanceStatus
    joinedAt?: Date
    leftAt?: Date
  }
) {
  const liveClass = await prisma.phase10LiveClass.findUnique({
    where: { id: liveClassId },
    select: {
      id: true,
      lessonId: true,
    },
  })

  if (!liveClass) {
    throw new Error('Live class not found')
  }

  const joinedAt = input?.joinedAt ?? new Date()
  const leftAt = input?.leftAt ?? null
  const durationMinutes = leftAt ? Math.max(0, Math.round((leftAt.getTime() - joinedAt.getTime()) / 60000)) : 0

  const attendance = await prisma.phase10LiveClassAttendance.upsert({
    where: {
      liveClassId_studentId: {
        liveClassId,
        studentId,
      },
    },
    create: {
      liveClassId,
      studentId,
      status: input?.status ?? Phase10LiveAttendanceStatus.ATTENDED,
      joinedAt,
      leftAt,
      durationMinutes,
    },
    update: {
      status: input?.status ?? Phase10LiveAttendanceStatus.ATTENDED,
      joinedAt,
      leftAt,
      durationMinutes,
    },
  })

  await prisma.phase10LessonProgress.upsert({
    where: {
      lessonId_studentId: {
        lessonId: liveClass.lessonId,
        studentId,
      },
    },
    create: {
      lessonId: liveClass.lessonId,
      studentId,
      attendanceCompleted: attendance.status === Phase10LiveAttendanceStatus.ATTENDED,
      isCompleted: attendance.status === Phase10LiveAttendanceStatus.ATTENDED,
      completionPercent: attendance.status === Phase10LiveAttendanceStatus.ATTENDED ? 100 : 0,
      completedAt: attendance.status === Phase10LiveAttendanceStatus.ATTENDED ? new Date() : null,
    },
    update: {
      attendanceCompleted: attendance.status === Phase10LiveAttendanceStatus.ATTENDED,
      isCompleted: attendance.status === Phase10LiveAttendanceStatus.ATTENDED,
      completionPercent: attendance.status === Phase10LiveAttendanceStatus.ATTENDED ? 100 : 0,
      completedAt: attendance.status === Phase10LiveAttendanceStatus.ATTENDED ? new Date() : null,
    },
  })

  return attendance
}

export async function createPhase10DiscussionThread(
  authorUserId: string,
  input: {
    courseId: string
    lessonId: string
    title: string
    body: string
  }
) {
  return prisma.phase10DiscussionThread.create({
    data: {
      courseId: input.courseId,
      lessonId: input.lessonId,
      authorUserId,
      title: input.title,
      body: input.body,
    },
  })
}

export async function createPhase10DiscussionReply(
  threadId: string,
  authorUserId: string,
  body: string,
  isTeacherReply = false
) {
  const reply = await prisma.phase10DiscussionReply.create({
    data: {
      threadId,
      authorUserId,
      body,
      isTeacherReply,
    },
    include: {
      thread: {
        include: {
          course: true,
        },
      },
    },
  })

  const thread = await prisma.phase10DiscussionThread.findUnique({
    where: { id: threadId },
    select: {
      authorUserId: true,
      courseId: true,
    },
  })

  if (thread && thread.authorUserId !== authorUserId) {
    await createNotificationsForUsers([thread.authorUserId], {
      title: 'LMS Discussion Reply',
      message: `A new reply was added to your thread: ${reply.thread.title}`,
      link: `/student/lms/${thread.courseId}`,
      type: 'info',
    })
  }

  return reply
}

export async function moderatePhase10DiscussionThread(
  threadId: string,
  input: {
    status?: Phase10DiscussionThreadStatus
    isPinned?: boolean
  },
  actorUserId: string
) {
  return prisma.phase10DiscussionThread.update({
    where: { id: threadId },
    data: {
      status: input.status ?? undefined,
      isPinned: input.isPinned ?? undefined,
      pinnedByUserId: typeof input.isPinned === 'boolean' && input.isPinned ? actorUserId : undefined,
      pinnedAt: typeof input.isPinned === 'boolean' && input.isPinned ? new Date() : undefined,
      isModerated: true,
      moderatedByUserId: actorUserId,
      moderatedAt: new Date(),
    },
  })
}

export async function listStudentPhase10Courses(studentUserId: string) {
  const profile = await getStudentCourseContext(studentUserId)
  if (!profile) {
    throw new Error('Student profile not found')
  }

  const offeringIds = profile.subjects.map((subject) => subject.academicOfferingId).filter(Boolean) as string[]
  const scopeConditions = profile.subjects.map((subject) => ({
    departmentId: profile.departmentId,
    subjectId: subject.subjectId,
    languageId: subject.languageId,
    groupId: subject.groupId,
    semesterId: subject.semesterId,
  }))

  const courses = await prisma.phase10Course.findMany({
    where: {
      isPublished: true,
      OR: [
        ...(offeringIds.length > 0 ? [{ academicOfferingId: { in: offeringIds } }] : []),
        ...scopeConditions,
      ],
    },
    include: {
      translations: true,
      versions: {
        include: {
          sections: {
            include: {
              lessons: true,
            },
          },
        },
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
      lessons: {
        include: {
          lessonProgress: {
            where: {
              studentId: profile.id,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return {
    profile,
    courses: courses.map((course) => ({
      ...resolveCourseTranslation(course, course.languageId),
      progressPercent:
        course.lessons.length > 0
          ? Number(
              (
                (course.lessons.filter((lesson) => lesson.lessonProgress[0]?.isCompleted).length / course.lessons.length) *
                100
              ).toFixed(2)
            )
          : 0,
    })),
  }
}

export async function getStudentPhase10CourseDetail(courseId: string, studentUserId: string) {
  const { profile, courses } = await listStudentPhase10Courses(studentUserId)
  const course = courses.find((item) => item.id === courseId)
  if (!profile || !course) {
    throw new Error('Course not found for this student')
  }

  const fullCourse = await prisma.phase10Course.findUnique({
    where: { id: courseId },
    include: {
      translations: true,
      lessons: {
        include: {
          translations: true,
          materials: {
            include: {
              translations: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
          videoAssets: true,
          liveClasses: {
            orderBy: { startAt: 'asc' },
          },
          lessonProgress: {
            where: { studentId: profile.id },
          },
          discussionThreads: {
            include: {
              replies: true,
            },
            orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!fullCourse) {
    throw new Error('Course not found')
  }

  return {
    ...resolveCourseTranslation(fullCourse, fullCourse.languageId),
    lessons: fullCourse.lessons.map((lesson) => ({
      ...resolveLessonTranslation(lesson, fullCourse.languageId),
      materials: lesson.materials.map((material) => resolveMaterialTranslation(material, fullCourse.languageId)),
    })),
  }
}

export async function buildPhase10ProgressSummary(courseId: string, studentId: string) {
  const course = await prisma.phase10Course.findUnique({
    where: { id: courseId },
    include: {
      lessons: {
        include: {
          lessonProgress: {
            where: { studentId },
          },
          videoProgress: {
            where: { studentId },
          },
          liveClasses: {
            include: {
              attendances: {
                where: { studentId },
              },
            },
          },
          videoAssets: {
            select: { id: true },
          },
        },
      },
    },
  })

  if (!course) {
    throw new Error('Course not found')
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      examAttendanceRecords: {
        where: {
          status: {
            in: [Phase8AttendanceStatus.PRESENT, Phase8AttendanceStatus.LATE, Phase8AttendanceStatus.MEDICAL_EXCUSED],
          },
          scheduleItem: course.academicOfferingId ? { academicOfferingId: course.academicOfferingId } : undefined,
        },
        select: { id: true },
      },
      courseworkAttempts: {
        where: {
          publication: course.academicOfferingId
            ? {
                academicOfferingId: course.academicOfferingId,
                status: { in: [CourseworkPublicationStatus.PUBLISHED, CourseworkPublicationStatus.CLOSED] },
              }
            : undefined,
          status: {
            in: [CourseworkAttemptStatus.SUBMITTED, CourseworkAttemptStatus.LOCKED, CourseworkAttemptStatus.AUTO_LOCKED],
          },
        },
        select: { id: true },
      },
    },
  })

  const totalLessons = course.lessons.length
  const completedLessons = course.lessons.filter((lesson) => lesson.lessonProgress[0]?.isCompleted).length
  const maxWatch = course.lessons.reduce(
    (sum, lesson) => sum + Math.max(0, ...lesson.videoProgress.map((progress) => progress.watchedPercentage), 0),
    0
  )
  const totalVideoLessons = course.lessons.filter((lesson) => lesson.videoProgress.length > 0 || lesson.videoAssets.length > 0).length
  const liveAttendance = course.lessons.reduce(
    (sum, lesson) => sum + lesson.liveClasses.filter((liveClass) => liveClass.attendances.some((attendance) => attendance.status === Phase10LiveAttendanceStatus.ATTENDED)).length,
    0
  )

  return {
    totalLessons,
    completedLessons,
    lessonCompletionPercent: totalLessons > 0 ? Number(((completedLessons / totalLessons) * 100).toFixed(2)) : 0,
    averageWatchPercent: totalVideoLessons > 0 ? Number((maxWatch / totalVideoLessons).toFixed(2)) : 0,
    assignmentCompletionCount: profile?.courseworkAttempts.length ?? 0,
    attendanceSignalCount: profile?.examAttendanceRecords.length ?? 0,
    liveAttendanceCount: liveAttendance,
  }
}
