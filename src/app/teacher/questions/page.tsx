import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

export default async function QuestionsPage() {
  const session = await requireRole(UserRole.TEACHER)

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      assignments: {
        include: {
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
          department: true,
        },
      },
    },
  })

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Teacher profile not found. Contact admin.</p>
      </div>
    )
  }

  const questions = await prisma.question.findMany({
    where: { teacherId: profile.id },
    select: {
      id: true,
      subjectId: true,
      academicYearId: true,
      languageId: true,
    },
  })

  const groupedAssignments = profile.assignments.reduce<
    Array<{
      academicYearId: string
      academicYearName: string
      entries: Array<{
        subjectId: string
        subjectName: string
        languageId: string
        languageName: string
        questionCount: number
        groupLabels: string[]
        semesterLabels: string[]
      }>
    }>
  >((years, assignment) => {
    let yearGroup = years.find((year) => year.academicYearId === assignment.academicYear.id)
    if (!yearGroup) {
      yearGroup = {
        academicYearId: assignment.academicYear.id,
        academicYearName: assignment.academicYear.name,
        entries: [],
      }
      years.push(yearGroup)
    }

    let assignmentEntry = yearGroup.entries.find(
      (entry) =>
        entry.subjectId === assignment.subject.id &&
        entry.languageId === assignment.language.id,
    )
    if (!assignmentEntry) {
      assignmentEntry = {
        subjectId: assignment.subject.id,
        subjectName: assignment.subject.name,
        languageId: assignment.language.id,
        languageName: assignment.language.name,
        questionCount: questions.filter(
          (question) =>
            question.subjectId === assignment.subject.id &&
            question.academicYearId === assignment.academicYear.id &&
            question.languageId === assignment.language.id,
        ).length,
        groupLabels: [],
        semesterLabels: [],
      }
      yearGroup.entries.push(assignmentEntry)
    }

    if (!assignmentEntry.groupLabels.includes(assignment.group.name)) {
      assignmentEntry.groupLabels.push(assignment.group.name)
    }

    if (!assignmentEntry.semesterLabels.includes(assignment.semester.name)) {
      assignmentEntry.semesterLabels.push(assignment.semester.name)
    }

    return years
  }, [])

  groupedAssignments.sort((a, b) => a.academicYearName.localeCompare(b.academicYearName))
  groupedAssignments.forEach((year) => {
    year.entries.sort((a, b) => {
      const subjectCompare = a.subjectName.localeCompare(b.subjectName)
      if (subjectCompare !== 0) return subjectCompare
      return a.languageName.localeCompare(b.languageName)
    })
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
        <p className="mt-1 text-gray-500">Select a year first, then open the subject question bank.</p>
      </div>

      {groupedAssignments.length === 0 ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-yellow-800">
          You have no assignments yet. Ask admin to assign you to subjects before creating questions.
        </div>
      ) : (
        <div className="space-y-5">
          {groupedAssignments.map((year) => (
            <section key={year.academicYearId} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-lg font-semibold text-gray-900">{year.academicYearName}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {year.entries.length} subject-language entr{year.entries.length > 1 ? 'ies' : 'y'}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Subject</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Groups</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Semesters</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Language</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Questions</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {year.entries.map((entry) => (
                      <tr key={`${entry.subjectId}-${entry.languageId}`} className="hover:bg-gray-50/70">
                        <td className="px-5 py-4 text-sm font-medium text-gray-900">{entry.subjectName}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{entry.groupLabels.join(', ')}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{entry.semesterLabels.join(', ')}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{entry.languageName}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{entry.questionCount}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/teacher/questions/${year.academicYearId}/${entry.subjectId}/${entry.languageId}`}
                              className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                            >
                              View
                            </Link>
                            <Link
                              href={`/teacher/questions/${year.academicYearId}/${entry.subjectId}/${entry.languageId}/new`}
                              className="inline-flex rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                            >
                              Add New
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
