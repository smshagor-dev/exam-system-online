import TeacherCourseworkEnterpriseNav from '@/components/teacher/TeacherCourseworkEnterpriseNav'
import TeacherCourseworkOverview from '@/components/teacher/TeacherCourseworkOverview'
import { requireRole } from '@/lib/auth'
import {
  resolveCourseworkAssignmentTranslation,
  resolveCourseworkRuleTranslation,
} from '@/lib/academic-content'
import { getTeacherEnterpriseCourseworkWorkspace } from '@/lib/coursework-enterprise-workspace'
import { getTeacherCourseworkWorkspace } from '@/lib/coursework-teacher'
import { UserRole } from '@prisma/client'

export default async function TeacherCourseworkPage() {
  const session = await requireRole(UserRole.TEACHER)
  const [workspace, enterpriseWorkspace] = await Promise.all([
    getTeacherCourseworkWorkspace(session.user.id),
    getTeacherEnterpriseCourseworkWorkspace(session.user.id),
  ])

  if (!workspace) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
    <div className="space-y-6">
      <TeacherCourseworkEnterpriseNav />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Enterprise templates', enterpriseWorkspace?.templates.length ?? 0],
          ['Enterprise assignments', enterpriseWorkspace?.publications.length ?? 0],
          ['Enterprise attempts', enterpriseWorkspace?.attempts.length ?? 0],
          ['Enterprise grades', enterpriseWorkspace?.grades.length ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Phase 7 Workspace</h2>
        <p className="mt-1 text-sm text-slate-500">
          Use the navigation above for enterprise templates, assignments, submissions, grading, extensions, and reports.
          The legacy coursework overview remains below for backward compatibility.
        </p>
      </section>

      <TeacherCourseworkOverview
        scopeOptions={workspace.teacherProfile.assignments.map((assignment) => ({
          departmentName: workspace.teacherProfile.department.name,
          subjectId: assignment.subjectId,
          subjectName: assignment.subject.name,
          languageId: assignment.languageId,
          languageName: assignment.language.name,
          groupId: assignment.groupId,
          groupName: assignment.group.name,
          academicYearId: assignment.academicYearId,
          academicYearName: assignment.academicYear.name,
          semesterId: assignment.semesterId,
          semesterName: assignment.semester.name,
        }))}
        rules={workspace.rules.map((rule) => {
          const resolvedRule = resolveCourseworkRuleTranslation(rule, rule.languageId)

          return {
            id: rule.id,
            departmentName: workspace.teacherProfile.department.name,
            subjectId: rule.subjectId,
            subjectName: rule.subject.name,
            languageId: rule.languageId,
            languageName: rule.language.name,
            groupId: rule.groupId,
            groupName: rule.group.name,
            academicYearId: rule.academicYearId,
            academicYearName: rule.academicYear.name,
            semesterId: rule.semesterId,
            semesterName: rule.semester.name,
            rules: resolvedRule.rules,
            submissionDeadline: rule.submissionDeadline ? rule.submissionDeadline.toISOString() : null,
            assignments: rule.assignments.map((assignment) => {
              const resolvedAssignment = resolveCourseworkAssignmentTranslation(
                assignment,
                assignment.languageId
              )

              return {
                id: assignment.id,
                studentName: assignment.student.user.name,
                studentEmail: assignment.student.user.email,
                title: resolvedAssignment.title,
                latestSubmission: assignment.submissions[0]
                  ? {
                      status: assignment.submissions[0].status,
                      createdAt: assignment.submissions[0].createdAt.toISOString(),
                    }
                  : null,
              }
            }),
          }
        })}
      />
    </div>
  )
}
