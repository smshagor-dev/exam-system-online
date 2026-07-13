import SimpleEntityManager from '@/components/admin/SimpleEntityManager'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function ExamCalendarPage() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const [sessions, departments, semesters, campuses, calendars] = await Promise.all([
    prisma.academicSession.findMany({ where: { isActive: true }, orderBy: { startDate: 'desc' } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.semester.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
    prisma.examCampus.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.examAcademicCalendar.findMany({
      include: {
        academicSession: true,
        department: true,
        semester: true,
        campus: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <div className="space-y-8">
      <SimpleEntityManager
        title="Exam Academic Calendars"
        singularLabel="Exam Calendar"
        items={calendars.map((calendar) => ({
          id: calendar.id,
          name: calendar.name,
          academicSessionId: calendar.academicSessionId,
          departmentId: calendar.departmentId ?? '',
          semesterId: calendar.semesterId ?? '',
          campusId: calendar.campusId ?? '',
          status: calendar.status,
          teachingStartsAt: calendar.teachingStartsAt.toISOString().slice(0, 16),
          teachingEndsAt: calendar.teachingEndsAt.toISOString().slice(0, 16),
          registrationStartsAt: calendar.registrationStartsAt.toISOString().slice(0, 16),
          registrationEndsAt: calendar.registrationEndsAt.toISOString().slice(0, 16),
          courseworkStartsAt: calendar.courseworkStartsAt.toISOString().slice(0, 16),
          courseworkEndsAt: calendar.courseworkEndsAt.toISOString().slice(0, 16),
          examinationStartsAt: calendar.examinationStartsAt.toISOString().slice(0, 16),
          examinationEndsAt: calendar.examinationEndsAt.toISOString().slice(0, 16),
          makeupStartsAt: calendar.makeupStartsAt ? calendar.makeupStartsAt.toISOString().slice(0, 16) : '',
          makeupEndsAt: calendar.makeupEndsAt ? calendar.makeupEndsAt.toISOString().slice(0, 16) : '',
        }))}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'status', label: 'Status' },
          { key: 'academicSessionId', label: 'Session' },
          { key: 'departmentId', label: 'Department' },
        ]}
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          {
            key: 'academicSessionId',
            label: 'Academic Session',
            type: 'select',
            required: true,
            options: sessions.map((session) => ({ value: session.id, label: session.name })),
          },
          {
            key: 'departmentId',
            label: 'Department',
            type: 'select',
            options: [{ value: '', label: 'All Departments' }, ...departments.map((department) => ({ value: department.id, label: department.name }))],
          },
          {
            key: 'semesterId',
            label: 'Semester',
            type: 'select',
            options: [{ value: '', label: 'All Semesters' }, ...semesters.map((semester) => ({ value: semester.id, label: semester.name }))],
          },
          {
            key: 'campusId',
            label: 'Campus',
            type: 'select',
            options: [{ value: '', label: 'All Campuses' }, ...campuses.map((campus) => ({ value: campus.id, label: campus.name }))],
          },
          { key: 'teachingStartsAt', label: 'Teaching Starts', type: 'datetime-local', required: true },
          { key: 'teachingEndsAt', label: 'Teaching Ends', type: 'datetime-local', required: true },
          { key: 'registrationStartsAt', label: 'Registration Starts', type: 'datetime-local', required: true },
          { key: 'registrationEndsAt', label: 'Registration Ends', type: 'datetime-local', required: true },
          { key: 'courseworkStartsAt', label: 'Coursework Starts', type: 'datetime-local', required: true },
          { key: 'courseworkEndsAt', label: 'Coursework Ends', type: 'datetime-local', required: true },
          { key: 'examinationStartsAt', label: 'Exam Starts', type: 'datetime-local', required: true },
          { key: 'examinationEndsAt', label: 'Exam Ends', type: 'datetime-local', required: true },
          { key: 'makeupStartsAt', label: 'Makeup Starts', type: 'datetime-local' },
          { key: 'makeupEndsAt', label: 'Makeup Ends', type: 'datetime-local' },
        ]}
        apiBase="/api/admin/exam-calendar"
        formMode="modal"
      />
    </div>
  )
}

