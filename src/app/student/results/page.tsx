import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import Link from 'next/link'

type ResultGroup = {
  academicYearId: string
  academicYearName: string
  academicYearNumber: number
  semesters: Array<{
    semesterId: string
    semesterName: string
    semesterNumber: number
    entries: Array<{
      id: string
      examTitle: string
      subjectName: string
      marksObtained: number
      totalMarks: number
      percentage: number
      grade: string | null
      isPassed: boolean
      publishedAt: Date | null
    }>
  }>
}

function statusClasses(isPassed: boolean) {
  return isPassed
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700'
}

export default async function StudentResultsPage() {
  const session = await requireRole(UserRole.STUDENT)

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  })

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Student profile not found.</div>
  }

  const results = await prisma.examResult.findMany({
    where: { studentId: profile.id, status: 'PUBLISHED' },
    include: {
      exam: {
        include: {
          subject: true,
          academicYear: true,
          semester: true,
        },
      },
    },
    orderBy: [
      { exam: { academicYear: { year: 'asc' } } },
      { exam: { semester: { number: 'asc' } } },
      { exam: { subject: { name: 'asc' } } },
      { publishedAt: 'desc' },
    ],
  })

  const yearMap = new Map<string, ResultGroup>()

  for (const result of results) {
    const yearKey = result.exam.academicYearId
    const semesterKey = result.exam.semesterId
    const existingYear = yearMap.get(yearKey)

    const entry = {
      id: result.id,
      examTitle: result.exam.title,
      subjectName: result.exam.subject.name,
      marksObtained: result.marksObtained,
      totalMarks: result.totalMarks,
      percentage: result.percentage,
      grade: result.grade,
      isPassed: result.isPassed,
      publishedAt: result.publishedAt,
    }

    if (!existingYear) {
      yearMap.set(yearKey, {
        academicYearId: yearKey,
        academicYearName: result.exam.academicYear.name,
        academicYearNumber: result.exam.academicYear.year,
        semesters: [
          {
            semesterId: semesterKey,
            semesterName: result.exam.semester.name,
            semesterNumber: result.exam.semester.number,
            entries: [entry],
          },
        ],
      })
      continue
    }

    const existingSemester = existingYear.semesters.find((semester) => semester.semesterId === semesterKey)
    if (existingSemester) {
      existingSemester.entries.push(entry)
      continue
    }

    existingYear.semesters.push({
      semesterId: semesterKey,
      semesterName: result.exam.semester.name,
      semesterNumber: result.exam.semester.number,
      entries: [entry],
    })
  }

  const groupedResults = Array.from(yearMap.values())
    .sort((a, b) => a.academicYearNumber - b.academicYearNumber)
    .map((year) => ({
      ...year,
      semesters: year.semesters
        .sort((a, b) => a.semesterNumber - b.semesterNumber)
        .map((semester) => ({
          ...semester,
          entries: semester.entries.sort((a, b) => {
            const bySubject = a.subjectName.localeCompare(b.subjectName)
            if (bySubject !== 0) return bySubject
            const byPublishedAt = (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)
            if (byPublishedAt !== 0) return byPublishedAt
            return a.examTitle.localeCompare(b.examTitle)
          }),
        })),
    }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Results</h1>
      </div>

      {groupedResults.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-16 text-center">
          <div className="mb-4 text-5xl">Results</div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">No Results Yet</h2>
          <p className="text-gray-500">Results will appear here once your teacher publishes them.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedResults.map((year) => (
            <section key={year.academicYearId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">Academic Year</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">{year.academicYearName}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {year.semesters.length} semester{year.semesters.length !== 1 ? 's' : ''} published
                </p>
              </div>

              <div className="space-y-6 p-6">
                {year.semesters.map((semester) => (
                  <div key={semester.semesterId} className="rounded-2xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{semester.semesterName}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {semester.entries.length} subject result{semester.entries.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-white">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Exam</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Mark</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Grade</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Published</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {semester.entries.map((entry) => (
                            <tr key={entry.id} className="transition hover:bg-slate-50">
                              <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                                <Link href={`/student/results/${entry.id}`} className="transition hover:text-blue-700">
                                  {entry.subjectName}
                                </Link>
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-600">{entry.examTitle}</td>
                              <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                                {entry.marksObtained}/{entry.totalMarks}
                                <span className="ml-2 text-xs font-medium text-slate-500">
                                  ({entry.percentage.toFixed(1)}%)
                                </span>
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-600">{entry.grade || '-'}</td>
                              <td className="px-5 py-4 text-sm">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(entry.isPassed)}`}>
                                  {entry.isPassed ? 'Passed' : 'Failed'}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-500">
                                {entry.publishedAt ? new Date(entry.publishedAt).toLocaleDateString() : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
