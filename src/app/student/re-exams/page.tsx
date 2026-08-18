import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getReExamVisibilityForStudent, listReExamRequestsByStudent } from '@/lib/reexam-store'
import ReExamRequestClient from '@/components/student/ReExamRequestClient'
import { UserRole } from '@prisma/client'

type PageProps = {
  searchParams: Promise<{ examId?: string }>
}

export default async function StudentReExamsPage({ searchParams }: PageProps) {
  const session = await requireRole(UserRole.STUDENT)
  const query = await searchParams

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      departmentId: true,
      subjects: {
        select: {
          subjectId: true,
          languageId: true,
          groupId: true,
          academicYearId: true,
          semesterId: true,
        },
      },
    },
  })

  if (!profile) {
    return <div className="py-20 text-center text-slate-500">Student profile not found.</div>
  }

  const [requestRecords, visibility] = await Promise.all([
    listReExamRequestsByStudent(session.user.id),
    getReExamVisibilityForStudent(session.user.id),
  ])

  const scope = profile.subjects.map((subject) => ({
    departmentId: profile.departmentId,
    subjectId: subject.subjectId,
    languageId: subject.languageId,
    groupId: subject.groupId,
    academicYearId: subject.academicYearId,
    semesterId: subject.semesterId,
  }))

  const pastExams = scope.length === 0
    ? []
    : await prisma.exam.findMany({
        where: {
          AND: [
            { OR: scope },
            {
              OR: [
                { endTime: { lte: new Date() } },
                { status: { in: ['COMPLETED', 'RESULT_PUBLISHED'] } },
              ],
            },
          ],
        },
        include: {
          subject: { select: { name: true } },
          attempts: {
            where: { studentId: profile.id },
            select: { status: true },
            take: 1,
          },
          results: {
            where: { studentId: profile.id },
            select: { marksObtained: true, percentage: true, isPassed: true },
            take: 1,
          },
        },
        orderBy: { endTime: 'desc' },
        take: 60,
      })

  const reExamIds = new Set(visibility.allReExamIds)
  const activeOriginalExamIds = new Set(
    requestRecords
      .filter((record) => record.status === 'PENDING' || record.status === 'APPROVED')
      .map((record) => record.originalExamId)
  )

  const eligibleExams = pastExams
    .filter((exam) => !reExamIds.has(exam.id) && !activeOriginalExamIds.has(exam.id))
    .map((exam) => ({
      id: exam.id,
      title: exam.title,
      subjectName: exam.subject.name,
      endedAt: exam.endTime.toISOString(),
      marksObtained: exam.results[0]?.marksObtained ?? null,
      percentage: exam.results[0]?.percentage ?? null,
      isPassed: exam.results[0]?.isPassed ?? null,
      attemptStatus: exam.attempts[0]?.status ?? null,
    }))

  const relatedExamIds = Array.from(
    new Set(
      requestRecords.flatMap((record) => [record.originalExamId, ...(record.reExamId ? [record.reExamId] : [])])
    )
  )
  const relatedExams = relatedExamIds.length === 0
    ? []
    : await prisma.exam.findMany({
        where: { id: { in: relatedExamIds } },
        select: { id: true, title: true, status: true, startTime: true, endTime: true },
      })
  const examMap = new Map(relatedExams.map((exam) => [exam.id, exam]))

  const requests = requestRecords.map((record) => {
    const originalExam = examMap.get(record.originalExamId)
    const reExam = record.reExamId ? examMap.get(record.reExamId) : null
    return {
      id: record.id,
      originalExamId: record.originalExamId,
      originalExamTitle: originalExam?.title ?? 'Original exam',
      reExamId: record.reExamId,
      reExamTitle: reExam?.title ?? null,
      reason: record.reason,
      type: record.type,
      status: record.status,
      source: record.source,
      teacherResponse: record.teacherResponse,
      requestedAt: record.requestedAt,
      decidedAt: record.decidedAt,
      reExamStatus: reExam?.status ?? null,
      reExamStartTime: reExam?.startTime.toISOString() ?? null,
      reExamEndTime: reExam?.endTime.toISOString() ?? null,
    }
  })

  return (
    <ReExamRequestClient
      eligibleExams={eligibleExams}
      requests={requests}
      initialExamId={query.examId}
    />
  )
}
