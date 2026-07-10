import { getAdminScope } from '@/lib/admin-scope'
import { formatBytes } from '@/lib/ebooks'
import { prisma } from '@/lib/prisma'

export default async function AdminEbooksPage() {
  const scope = await getAdminScope()

  const ebooks = await prisma.ebookUpload.findMany({
    where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
    include: {
      teacher: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          department: true,
        },
      },
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const teacherMap = new Map<string, { name: string; email: string; departmentName: string; uploadCount: number; latestUploadAt: Date }>()

  for (const ebook of ebooks) {
    const current = teacherMap.get(ebook.teacherId)
    if (!current) {
      teacherMap.set(ebook.teacherId, {
        name: ebook.teacher.user.name,
        email: ebook.teacher.user.email,
        departmentName: ebook.teacher.department.name,
        uploadCount: 1,
        latestUploadAt: ebook.createdAt,
      })
      continue
    }

    current.uploadCount += 1
    if (ebook.createdAt > current.latestUploadAt) {
      current.latestUploadAt = ebook.createdAt
    }
  }

  const teacherSummaries = Array.from(teacherMap.values()).sort((a, b) => b.uploadCount - a.uploadCount)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ebook Upload Monitor</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track which teacher uploaded which ebook. Admins can monitor progress here without student download controls.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Ebooks</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{ebooks.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Teachers Uploading</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{teacherSummaries.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Latest Upload</p>
          <p className="mt-2 text-lg font-bold text-gray-900">
            {ebooks[0]?.createdAt ? ebooks[0].createdAt.toLocaleDateString() : 'No uploads'}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Teacher Progress</h2>
          <p className="mt-1 text-sm text-gray-500">Who is uploading ebook material across departments</p>
        </div>

        {teacherSummaries.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No teacher ebook uploads found yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Teacher</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Department</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Uploads</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Latest Upload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {teacherSummaries.map((teacher) => (
                  <tr key={`${teacher.email}-${teacher.latestUploadAt.toISOString()}`}>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      <p className="font-semibold text-gray-900">{teacher.name}</p>
                      <p className="text-xs text-gray-500">{teacher.email}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{teacher.departmentName}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">{teacher.uploadCount}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{teacher.latestUploadAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Latest Upload Entries</h2>
          <p className="mt-1 text-sm text-gray-500">Scope-by-scope ebook upload progress</p>
        </div>

        {ebooks.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No upload records available yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Title</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Teacher</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Scope</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">PDF Size</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {ebooks.map((ebook) => (
                  <tr key={ebook.id}>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      <p className="font-semibold text-gray-900">{ebook.title}</p>
                      {ebook.description ? <p className="mt-1 text-xs text-gray-500">{ebook.description}</p> : null}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      <p className="font-medium text-gray-900">{ebook.teacher.user.name}</p>
                      <p className="text-xs text-gray-500">{ebook.teacher.department.name}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {ebook.subject.name} · {ebook.language.name} · {ebook.academicYear.name} · {ebook.semester.name} · {ebook.group.name}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{formatBytes(ebook.fileSizeBytes)}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{ebook.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
