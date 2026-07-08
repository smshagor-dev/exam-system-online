import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function AdminStudentsPage() {
  const scope = await getAdminScope()

  const students = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      ...(scope.isSuperAdmin ? {} : { studentProfile: { departmentId: { in: scope.managedDepartmentIds } } }),
    },
    include: {
      studentProfile: {
        include: {
          department: true,
          subjects: {
            include: { subject: true, group: true, academicYear: true, semester: true },
          },
          _count: { select: { examAttempts: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500 mt-1">{students.length} registered students</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
              <th className="px-5 py-3 text-left">Student</th>
              <th className="px-5 py-3 text-left">Department</th>
              <th className="px-5 py-3 text-left">Enrolled Subjects</th>
              <th className="px-5 py-3 text-left">Exams Taken</th>
              <th className="px-5 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {students.map((student) => (
              <tr key={student.id} className="hover:bg-gray-50">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-900 text-sm">{student.name}</p>
                  <p className="text-xs text-gray-400">{student.email}</p>
                  {student.studentProfile?.rollNumber && (
                    <p className="text-xs text-blue-600">{student.studentProfile.rollNumber}</p>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  {student.studentProfile?.department.name ?? '—'}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {student.studentProfile?.subjects.slice(0, 3).map((s) => (
                      <span key={s.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {s.subject.name}
                      </span>
                    ))}
                    {(student.studentProfile?.subjects.length ?? 0) > 3 && (
                      <span className="text-xs text-gray-400">+{(student.studentProfile?.subjects.length ?? 0) - 3} more</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  {student.studentProfile?._count.examAttempts ?? 0}
                </td>
                <td className="px-5 py-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${student.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {student.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">
                  No students registered yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
