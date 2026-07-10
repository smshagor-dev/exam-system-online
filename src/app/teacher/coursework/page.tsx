import TeacherCourseworkOverview from '@/components/teacher/TeacherCourseworkOverview'
import { requireRole } from '@/lib/auth'
import { getTeacherCourseworkWorkspace } from '@/lib/coursework-teacher'
import { UserRole } from '@prisma/client'

export default async function TeacherCourseworkPage() {
  const session = await requireRole(UserRole.TEACHER)
  const workspace = await getTeacherCourseworkWorkspace(session.user.id)

  if (!workspace) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
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
      rules={workspace.rules.map((rule) => ({
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
        rules: rule.rules,
        submissionDeadline: rule.submissionDeadline ? rule.submissionDeadline.toISOString() : null,
        assignments: rule.assignments.map((assignment) => ({
          id: assignment.id,
          studentName: assignment.student.user.name,
          studentEmail: assignment.student.user.email,
          title: assignment.title,
          latestSubmission: assignment.submissions[0]
            ? {
                status: assignment.submissions[0].status,
                createdAt: assignment.submissions[0].createdAt.toISOString(),
              }
            : null,
        })),
      }))}
    />
  )
}
