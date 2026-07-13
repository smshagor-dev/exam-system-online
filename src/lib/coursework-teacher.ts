import { prisma } from '@/lib/prisma'

export async function getTeacherCourseworkWorkspace(userId: string) {
  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId },
    include: {
      department: true,
      assignments: {
        include: {
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
        orderBy: [
          { academicYear: { year: 'asc' } },
          { semester: { number: 'asc' } },
          { subject: { name: 'asc' } },
        ],
      },
    },
  })

  if (!teacherProfile) {
    return null
  }

  const scopeFilters = teacherProfile.assignments.map((assignment) => ({
    subjectId: assignment.subjectId,
    languageId: assignment.languageId,
    groupId: assignment.groupId,
    academicYearId: assignment.academicYearId,
    semesterId: assignment.semesterId,
  }))

  const students = scopeFilters.length > 0
    ? await prisma.studentProfile.findMany({
        where: {
          departmentId: teacherProfile.departmentId,
          subjects: {
            some: {
              OR: scopeFilters,
            },
          },
        },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          subjects: {
            where: {
              OR: scopeFilters,
            },
            include: {
              subject: true,
              language: true,
              group: true,
              academicYear: true,
              semester: true,
            },
          },
          courseworkAssignments: {
            where: {
              teacherId: teacherProfile.id,
            },
            include: {
              rule: {
                include: {
                  translations: true,
                },
              },
              translations: true,
              accessRequests: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
              },
              submissions: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: {
          user: {
            name: 'asc',
          },
        },
      })
    : []

  const rules = await prisma.courseworkRule.findMany({
    where: {
      teacherId: teacherProfile.id,
    },
    include: {
      translations: true,
      subject: true,
      language: true,
      group: true,
      academicYear: true,
      semester: true,
      assignments: {
        include: {
          translations: true,
          student: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
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
        orderBy: {
          student: {
            user: {
              name: 'asc',
            },
          },
        },
      },
    },
    orderBy: [
      { academicYear: { year: 'asc' } },
      { semester: { number: 'asc' } },
      { subject: { name: 'asc' } },
    ],
  })

  const submissions = await prisma.courseworkSubmission.findMany({
    where: {
      assignment: {
        teacherId: teacherProfile.id,
      },
    },
    include: {
      student: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      assignment: {
        include: {
          rule: {
            include: {
              translations: true,
            },
          },
          translations: true,
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  const accessRequests = await prisma.courseworkAccessRequest.findMany({
    where: {
      assignment: {
        teacherId: teacherProfile.id,
      },
    },
    include: {
      student: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      assignment: {
        include: {
          rule: {
            include: {
              translations: true,
            },
          },
          translations: true,
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return {
    teacherProfile,
    scopeFilters,
    students,
    rules,
    submissions,
    accessRequests,
  }
}
