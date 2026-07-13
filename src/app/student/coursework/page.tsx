import StudentCourseworkManager from '@/components/student/StudentCourseworkManager'
import StudentCourseworkEnterpriseHome from '@/components/student/StudentCourseworkEnterpriseHome'
import { requireRole } from '@/lib/auth'
import {
  resolveCourseworkAssignmentTranslation,
  resolveCourseworkRuleTranslation,
} from '@/lib/academic-content'
import { getStudentEnterpriseCourseworkWorkspace } from '@/lib/coursework-enterprise-workspace'
import { prisma } from '@/lib/prisma'
import { CourseworkAccessRequestStatus, UserRole } from '@prisma/client'

export default async function StudentCourseworkPage() {
  const session = await requireRole(UserRole.STUDENT)

  const [profile, enterpriseWorkspace] = await Promise.all([
    prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      courseworkAssignments: {
        include: {
          rule: {
            include: {
              translations: true,
            },
          },
          translations: true,
          teacher: {
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
          submissions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          accessRequests: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
        orderBy: [
          { academicYear: { year: 'asc' } },
          { semester: { number: 'asc' } },
          { subject: { name: 'asc' } },
        ],
      },
    },
  }),
    getStudentEnterpriseCourseworkWorkspace(session.user.id),
  ])

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Student profile not configured. Contact admin.</div>
  }

  return (
    <div className="space-y-8">
      {enterpriseWorkspace ? (
        <StudentCourseworkEnterpriseHome publications={enterpriseWorkspace.publications} />
      ) : null}

      <StudentCourseworkManager
        assignments={profile.courseworkAssignments.map((assignment) => {
          const resolvedAssignment = resolveCourseworkAssignmentTranslation(
            assignment,
            assignment.languageId
          )
          const resolvedRule = assignment.rule
            ? resolveCourseworkRuleTranslation(assignment.rule, assignment.languageId)
            : null

          return {
            id: assignment.id,
            title: resolvedAssignment.title,
            rules: resolvedRule?.rules ?? resolvedAssignment.rules ?? '',
            teacherName: assignment.teacher.user.name,
            subjectName: assignment.subject.name,
            languageName: assignment.language.name,
            groupName: assignment.group.name,
            academicYearName: assignment.academicYear.name,
            semesterName: assignment.semester.name,
            submissionDeadline: assignment.rule?.submissionDeadline ? assignment.rule.submissionDeadline.toISOString() : null,
            latestAccessRequest: assignment.accessRequests[0]
              ? {
                  status: assignment.accessRequests[0].status,
                  message: assignment.accessRequests[0].message,
                  teacherNote: assignment.accessRequests[0].teacherNote,
                  extensionDeadline: assignment.accessRequests[0].extensionDeadline
                    ? assignment.accessRequests[0].extensionDeadline.toISOString()
                    : null,
                  createdAt: assignment.accessRequests[0].createdAt.toISOString(),
                  canSubmitWithAccess: assignment.accessRequests[0].status === CourseworkAccessRequestStatus.APPROVED,
                }
              : null,
            latestSubmission: assignment.submissions[0]
              ? {
                  status: assignment.submissions[0].status,
                  aiFeedback: assignment.submissions[0].aiFeedback,
                  fileUrl: assignment.submissions[0].fileUrl,
                  fileName: assignment.submissions[0].fileName,
                  fileSizeBytes: assignment.submissions[0].fileSizeBytes,
                  createdAt: assignment.submissions[0].createdAt.toISOString(),
                }
              : null,
          }
        })}
      />
    </div>
  )
}
