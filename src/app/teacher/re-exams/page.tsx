import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getReExamVisibilityForStudent, listReExamRequestsByTeacher } from '@/lib/reexam-store'
import ReExamManagementClient from '@/components/teacher/ReExamManagementClient'
import { UserRole } from '@prisma/client'

export default async function TeacherReExamsPage() {
  const session = await requireRole(UserRole.TEACHER)
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return <div className="py-20 text-center text-slate-500">Teacher profile not found.</div>
  }

  const records = await listReExamRequestsByTeacher(session.user.id)
  const relatedExamIds = Array.from(
    new Set(records.flatMap((record) => [record.originalExamId, ...(record.reExamId ? [record.reExamId] : [])]))
  )
  const studentIds = Array.from(new Set(records.map((record) => record.studentId)))

  const [relatedExams, students, teacherExams, visibility] = await Promise.all([
    relatedExamIds.length === 0
      ? Promise.resolve([])
      : prisma.exam.findMany({
          where: { id: { in: relatedExamIds } },
          select: { id: true, title: true, status: true },
        }),
    studentIds.length === 0
      ? Promise.resolve([])
      : prisma.studentProfile.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, user: { select: { name: true, email: true } } },
        }),
    prisma.exam.findMany({
      where: {
        teacherId: profile.id,
        OR: [
          { endTime: { lte: new Date() } },
          { status: { in: ['COMPLETED', 'RESULT_PUBLISHED'] } },
        ],
      },
      select: {
        id: true,
        title: true,
        academicOfferingId: true,
        subjectId: true,
        languageId: true,
        groupId: true,
        academicYearId: true,
        semesterId: true,
        subject: { select: { name: true } },
        group: { select: { name: true } },
      },
      orderBy: { endTime: 'desc' },
      take: 30,
    }),
    // The helper returns the global approved re-exam IDs; user ID only affects the "mine" subset.
    getReExamVisibilityForStudent('__teacher_visibility__'),
  ])

  const examMap = new Map(relatedExams.map((exam) => [exam.id, exam]))
  const studentMap = new Map(students.map((student) => [student.id, student]))

  const requests = records.map((record) => {
    const student = studentMap.get(record.studentId)
    const originalExam = examMap.get(record.originalExamId)
    const reExam = record.reExamId ? examMap.get(record.reExamId) : null
    return {
      id: record.id,
      studentId: record.studentId,
      studentName: student?.user.name ?? 'Student',
      studentEmail: student?.user.email ?? '',
      originalExamId: record.originalExamId,
      originalExamTitle: originalExam?.title ?? 'Original exam',
      reExamId: record.reExamId,
      reExamTitle: reExam?.title ?? null,
      reExamStatus: reExam?.status ?? null,
      reason: record.reason,
      type: record.type,
      source: record.source,
      status: record.status,
      teacherResponse: record.teacherResponse,
      requestedAt: record.requestedAt,
    }
  })

  const reExamIds = new Set(visibility.allReExamIds)
  const regularTeacherExams = teacherExams.filter((exam) => !reExamIds.has(exam.id))

  const manualOptions = await Promise.all(
    regularTeacherExams.map(async (exam) => {
      const enrolled = await prisma.studentSubject.findMany({
        where: exam.academicOfferingId
          ? {
              OR: [
                { academicOfferingId: exam.academicOfferingId },
                {
                  subjectId: exam.subjectId,
                  languageId: exam.languageId,
                  groupId: exam.groupId,
                  academicYearId: exam.academicYearId,
                  semesterId: exam.semesterId,
                },
              ],
            }
          : {
              subjectId: exam.subjectId,
              languageId: exam.languageId,
              groupId: exam.groupId,
              academicYearId: exam.academicYearId,
              semesterId: exam.semesterId,
            },
        select: {
          student: {
            select: {
              id: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
        take: 250,
      })

      const uniqueStudents = Array.from(
        new Map(enrolled.map((entry) => [entry.student.id, entry.student])).values()
      )

      return {
        examId: exam.id,
        examTitle: exam.title,
        subjectName: exam.subject.name,
        groupName: exam.group.name,
        students: uniqueStudents.map((student) => ({
          id: student.id,
          name: student.user.name,
          email: student.user.email,
        })),
      }
    })
  )

  return (
    <ReExamManagementClient
      requests={requests}
      manualOptions={manualOptions.filter((option) => option.students.length > 0)}
    />
  )
}
