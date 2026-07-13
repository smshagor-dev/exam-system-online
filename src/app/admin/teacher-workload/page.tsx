import { getAdminScope } from '@/lib/admin-scope'
import { getTeacherReportingSnapshot } from '@/lib/teaching-assignment-admin'

export default async function TeacherWorkloadAdminPage() {
  const scope = await getAdminScope()
  const snapshot = await getTeacherReportingSnapshot(scope)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teacher Workload Reports</h1>
          <p className="mt-1 text-gray-500">Phase 4 reporting summary covering assignments, workload, overload, substitutions, and unassigned offerings.</p>
        </div>
        <a href="/api/admin/teacher-workload/reports?format=csv" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Download CSV
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Assignment Summary" value={snapshot.assignmentSummary.length} />
        <MetricCard label="Overloaded Teachers" value={snapshot.overloadedTeachers.length} />
        <MetricCard label="Unassigned Offerings" value={snapshot.unassignedOfferings.length} />
        <MetricCard label="Substitution Records" value={snapshot.substitutionHistory.length} />
      </div>

      <Section title="Teacher Assignment Summary">
        <SimpleTable
          headers={['Teacher', 'Department', 'Offering', 'Roles', 'Status', 'Weekly']}
          rows={snapshot.assignmentSummary.map((item) => [
            item.teacherName,
            item.departmentName,
            item.offeringLabel,
            item.roles.join(', '),
            item.status,
            String(item.weeklyHours),
          ])}
          emptyMessage="No teaching assignments found."
        />
      </Section>

      <Section title="Weekly Workload">
        <SimpleTable
          headers={['Teacher', 'Department', 'Weekly Hours', 'Weekly Limit', 'Overloaded']}
          rows={snapshot.weeklyWorkload.map((item) => [
            item.teacherName,
            item.departmentName,
            String(item.weeklyHours),
            item.weeklyLimit == null ? 'n/a' : String(item.weeklyLimit),
            item.overWeeklyLimit ? 'Yes' : 'No',
          ])}
          emptyMessage="No weekly workload data found."
        />
      </Section>

      <Section title="Semester Workload">
        <SimpleTable
          headers={['Teacher', 'Department', 'Semester Hours', 'Semester Limit', 'Overloaded']}
          rows={snapshot.semesterWorkload.map((item) => [
            item.teacherName,
            item.departmentName,
            String(item.semesterHours),
            item.semesterLimit == null ? 'n/a' : String(item.semesterLimit),
            item.overSemesterLimit ? 'Yes' : 'No',
          ])}
          emptyMessage="No semester workload data found."
        />
      </Section>

      <Section title="Overloaded Teachers">
        <SimpleTable
          headers={['Teacher', 'Department', 'Weekly Hours', 'Semester Hours', 'Weekly Limit', 'Semester Limit']}
          rows={snapshot.overloadedTeachers.map((item) => [
            item.teacherName,
            item.departmentName,
            String(item.weeklyHours),
            String(item.semesterHours),
            item.weeklyLimit == null ? 'n/a' : String(item.weeklyLimit),
            item.semesterLimit == null ? 'n/a' : String(item.semesterLimit),
          ])}
          emptyMessage="No overloaded teachers detected."
        />
      </Section>

      <Section title="Unassigned Offerings">
        <SimpleTable
          headers={['Department', 'Subject', 'Group', 'Language', 'Semester', 'Session']}
          rows={snapshot.unassignedOfferings.map((item) => [
            item.departmentName,
            item.subjectName,
            item.groupName,
            item.languageName,
            item.semesterName,
            item.sessionName,
          ])}
          emptyMessage="No unassigned offerings found."
        />
      </Section>

      <Section title="Substitution History">
        <SimpleTable
          headers={['Subject', 'Group', 'Original', 'Substitute', 'Status', 'Dates']}
          rows={snapshot.substitutionHistory.map((item) => [
            item.subjectName,
            item.groupName,
            item.originalTeacher,
            item.substituteTeacher,
            item.status,
            `${item.startsAt.toLocaleDateString()} - ${item.endsAt.toLocaleDateString()}`,
          ])}
          emptyMessage="No substitution history found."
        />
      </Section>

      <Section title="Role Distribution">
        <SimpleTable
          headers={['Role', 'Count']}
          rows={snapshot.roleDistribution.map((item) => [item.role, String(item.count)])}
          emptyMessage="No assignment roles found."
        />
      </Section>

      <Section title="Legacy Assignments Preserved">
        <SimpleTable
          headers={['Teacher', 'Department', 'Subject', 'Group', 'Language', 'Offering Mapping']}
          rows={snapshot.legacyAssignments.map((item) => [
            item.teacherName,
            item.departmentName,
            item.subjectName,
            item.groupName,
            item.languageName,
            item.academicOfferingId ?? 'Legacy only',
          ])}
          emptyMessage="No legacy assignments found."
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function SimpleTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[]
  rows: string[][]
  emptyMessage: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            {headers.map((header) => (
              <th key={header} className="px-5 py-3">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, rowIndex) => (
            <tr key={`${row.join('-')}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-5 py-4 text-sm text-gray-600">{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-5 py-10 text-center text-sm text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
