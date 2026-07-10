import { formatBytes } from '@/lib/ebooks'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

type StudentEbookYearGroup = {
  academicYearId: string
  academicYearName: string
  academicYearNumber: number
  semesters: Array<{
    semesterId: string
    semesterName: string
    semesterNumber: number
    ebooks: Array<{
      id: string
      title: string
      description: string | null
      fileUrl: string
      fileSizeBytes: number
      subjectName: string
      languageName: string
      groupName: string
      teacherName: string
      createdAt: Date
    }>
  }>
}

export default async function StudentEbooksPage() {
  const session = await requireRole(UserRole.STUDENT)

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      subjects: {
        include: {
          academicYear: true,
        },
      },
    },
  })

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Student profile not configured. Contact admin.</div>
  }

  if (profile.subjects.length === 0) {
    return <div className="py-20 text-center text-gray-500">No enrolled subject scope found for ebook access.</div>
  }

  const currentAcademicYearNumber = Math.max(...profile.subjects.map((subject) => subject.academicYear.year))
  const scopeFilters = profile.subjects.map((subject) => ({
    subjectId: subject.subjectId,
    languageId: subject.languageId,
    groupId: subject.groupId,
    academicYearId: subject.academicYearId,
    semesterId: subject.semesterId,
  }))

  const ebooks = await prisma.ebookUpload.findMany({
    where: {
      departmentId: profile.departmentId,
      OR: scopeFilters,
      academicYear: {
        year: {
          lte: currentAcademicYearNumber,
        },
      },
    },
    include: {
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      teacher: {
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      { academicYear: { year: 'asc' } },
      { semester: { number: 'asc' } },
      { subject: { name: 'asc' } },
      { createdAt: 'desc' },
    ],
  })

  const yearMap = new Map<string, StudentEbookYearGroup>()

  for (const ebook of ebooks) {
    const existingYear = yearMap.get(ebook.academicYearId)
    const mappedEbook = {
      id: ebook.id,
      title: ebook.title,
      description: ebook.description,
      fileUrl: ebook.fileUrl,
      fileSizeBytes: ebook.fileSizeBytes,
      subjectName: ebook.subject.name,
      languageName: ebook.language.name,
      groupName: ebook.group.name,
      teacherName: ebook.teacher.user.name,
      createdAt: ebook.createdAt,
    }

    if (!existingYear) {
      yearMap.set(ebook.academicYearId, {
        academicYearId: ebook.academicYearId,
        academicYearName: ebook.academicYear.name,
        academicYearNumber: ebook.academicYear.year,
        semesters: [
          {
            semesterId: ebook.semesterId,
            semesterName: ebook.semester.name,
            semesterNumber: ebook.semester.number,
            ebooks: [mappedEbook],
          },
        ],
      })
      continue
    }

    const existingSemester = existingYear.semesters.find((semester) => semester.semesterId === ebook.semesterId)
    if (existingSemester) {
      existingSemester.ebooks.push(mappedEbook)
      continue
    }

    existingYear.semesters.push({
      semesterId: ebook.semesterId,
      semesterName: ebook.semester.name,
      semesterNumber: ebook.semester.number,
      ebooks: [mappedEbook],
    })
  }

  const groupedYears = Array.from(yearMap.values())
    .sort((a, b) => a.academicYearNumber - b.academicYearNumber)
    .map((year) => ({
      ...year,
      semesters: year.semesters
        .sort((a, b) => a.semesterNumber - b.semesterNumber)
        .map((semester) => ({
          ...semester,
          ebooks: semester.ebooks.sort((a, b) => {
            const subjectCompare = a.subjectName.localeCompare(b.subjectName)
            if (subjectCompare !== 0) return subjectCompare
            return a.title.localeCompare(b.title)
          }),
        })),
    }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ebook Library</h1>
        <p className="mt-1 text-sm text-gray-500">
          Open and download your current and past year PDF ebooks. Upcoming-year uploads stay hidden.
        </p>
      </div>

      {groupedYears.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center">
          <h2 className="text-xl font-semibold text-slate-900">No Ebooks Yet</h2>
          <p className="mt-2 text-sm text-slate-500">Your teachers have not uploaded any visible PDF ebooks for your scope yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedYears.map((year) => (
            <section key={year.academicYearId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-700">Academic Year</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">{year.academicYearName}</h2>
              </div>

              <div className="space-y-6 p-6">
                {year.semesters.map((semester) => (
                  <div key={semester.semesterId} className="rounded-2xl border border-slate-200">
                    <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                      <h3 className="text-lg font-semibold text-slate-900">{semester.semesterName}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {semester.ebooks.length} ebook{semester.ebooks.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {semester.ebooks.map((ebook) => (
                        <div key={ebook.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <h4 className="text-lg font-semibold text-slate-900">{ebook.title}</h4>
                            <p className="mt-1 text-sm text-slate-500">
                              {ebook.subjectName} · {ebook.languageName} · {ebook.groupName}
                            </p>
                            {ebook.description ? <p className="mt-2 text-sm text-slate-600">{ebook.description}</p> : null}
                            <p className="mt-2 text-xs text-slate-400">
                              Uploaded by {ebook.teacherName} · {new Date(ebook.createdAt).toLocaleDateString()} · {formatBytes(ebook.fileSizeBytes)}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <a
                              href={ebook.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                            >
                              Open
                            </a>
                            <a
                              href={ebook.fileUrl}
                              download={ebook.title}
                              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      ))}
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
