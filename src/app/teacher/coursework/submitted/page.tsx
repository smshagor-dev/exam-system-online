import TeacherCourseworkSubmissionsView from '@/components/teacher/TeacherCourseworkSubmissionsView'
import { requireRole } from '@/lib/auth'
import { getTeacherCourseworkWorkspace } from '@/lib/coursework-teacher'
import { UserRole } from '@prisma/client'

export default async function TeacherCourseworkSubmittedPage() {
  const session = await requireRole(UserRole.TEACHER)
  const workspace = await getTeacherCourseworkWorkspace(session.user.id)

  if (!workspace) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
    <TeacherCourseworkSubmissionsView
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
      submissions={workspace.submissions.map((submission) => ({
        id: submission.id,
        studentName: submission.student.user.name,
        studentEmail: submission.student.user.email,
        title: submission.assignment.title,
        subjectId: submission.assignment.subjectId,
        subjectName: submission.assignment.subject.name,
        languageId: submission.assignment.languageId,
        languageName: submission.assignment.language.name,
        groupId: submission.assignment.groupId,
        groupName: submission.assignment.group.name,
        academicYearId: submission.assignment.academicYearId,
        academicYearName: submission.assignment.academicYear.name,
        semesterId: submission.assignment.semesterId,
        semesterName: submission.assignment.semester.name,
        status: submission.status,
        aiFeedback: submission.aiFeedback,
        fileUrl: submission.fileUrl,
        fileName: submission.fileName,
        fileSizeBytes: submission.fileSizeBytes,
        createdAt: submission.createdAt.toISOString(),
        submissionDeadline: submission.assignment.rule?.submissionDeadline
          ? submission.assignment.rule.submissionDeadline.toISOString()
          : null,
      }))}
      accessRequests={workspace.accessRequests.map((request) => ({
        id: request.id,
        studentName: request.student.user.name,
        studentEmail: request.student.user.email,
        title: request.assignment.title,
        subjectId: request.assignment.subjectId,
        subjectName: request.assignment.subject.name,
        languageId: request.assignment.languageId,
        languageName: request.assignment.language.name,
        groupId: request.assignment.groupId,
        groupName: request.assignment.group.name,
        academicYearId: request.assignment.academicYearId,
        academicYearName: request.assignment.academicYear.name,
        semesterId: request.assignment.semesterId,
        semesterName: request.assignment.semester.name,
        message: request.message,
        status: request.status,
        teacherNote: request.teacherNote,
        extensionDeadline: request.extensionDeadline ? request.extensionDeadline.toISOString() : null,
        createdAt: request.createdAt.toISOString(),
        originalDeadline: request.assignment.rule?.submissionDeadline
          ? request.assignment.rule.submissionDeadline.toISOString()
          : null,
      }))}
    />
  )
}
