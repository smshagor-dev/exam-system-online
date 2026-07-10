import TeacherCourseworkManager from '@/components/teacher/TeacherCourseworkManager'
import { requireRole } from '@/lib/auth'
import { getTeacherCourseworkWorkspace } from '@/lib/coursework-teacher'
import { getAiConfig } from '@/lib/system-settings'
import { UserRole } from '@prisma/client'

export default async function TeacherCourseworkCreatePage() {
  const session = await requireRole(UserRole.TEACHER)
  const [workspace, aiConfig] = await Promise.all([
    getTeacherCourseworkWorkspace(session.user.id),
    getAiConfig(),
  ])

  if (!workspace) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
    <TeacherCourseworkManager
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
        subjectId: rule.subjectId,
        languageId: rule.languageId,
        groupId: rule.groupId,
        academicYearId: rule.academicYearId,
        semesterId: rule.semesterId,
        rules: rule.rules,
        useAiValidation: rule.useAiValidation,
        submissionDeadline: rule.submissionDeadline ? rule.submissionDeadline.toISOString() : null,
      }))}
      aiSettings={{
        enabled: aiConfig.enabled && Boolean(aiConfig.provider),
        providerLabel: aiConfig.provider,
      }}
      students={workspace.students.map((student) => ({
        id: student.id,
        name: student.user.name,
        email: student.user.email,
        scopes: student.subjects.map((subject) => ({
          departmentName: workspace.teacherProfile.department.name,
          subjectId: subject.subjectId,
          subjectName: subject.subject.name,
          languageId: subject.languageId,
          languageName: subject.language.name,
          groupId: subject.groupId,
          groupName: subject.group.name,
          academicYearId: subject.academicYearId,
          academicYearName: subject.academicYear.name,
          semesterId: subject.semesterId,
          semesterName: subject.semester.name,
        })),
        courseworkAssignments: student.courseworkAssignments.map((assignment) => ({
          id: assignment.id,
          title: assignment.title,
          subjectId: assignment.subjectId,
          languageId: assignment.languageId,
          groupId: assignment.groupId,
          academicYearId: assignment.academicYearId,
          semesterId: assignment.semesterId,
          latestSubmission: assignment.submissions[0]
            ? {
                status: assignment.submissions[0].status,
                aiFeedback: assignment.submissions[0].aiFeedback,
                createdAt: assignment.submissions[0].createdAt.toISOString(),
              }
            : null,
        })),
      }))}
    />
  )
}
