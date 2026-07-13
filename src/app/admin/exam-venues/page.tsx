import SimpleEntityManager from '@/components/admin/SimpleEntityManager'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function ExamVenuesPage() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const [departments, campuses, buildings, rooms] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.examCampus.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.examBuilding.findMany({ include: { campus: true }, orderBy: { name: 'asc' } }),
    prisma.examRoom.findMany({ include: { campus: true, building: true }, orderBy: { code: 'asc' } }),
  ])

  return (
    <div className="space-y-8">
      <SimpleEntityManager
        title="Campuses"
        singularLabel="Campus"
        items={campuses}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'code', label: 'Code' },
          { key: 'departmentId', label: 'Department' },
        ]}
        fields={[
          {
            key: 'departmentId',
            label: 'Department',
            type: 'select',
            options: [{ value: '', label: 'Global Campus' }, ...departments.map((department) => ({ value: department.id, label: department.name }))],
          },
          { key: 'name', label: 'Campus Name', type: 'text', required: true },
          { key: 'code', label: 'Campus Code', type: 'text', required: true },
          { key: 'description', label: 'Description', type: 'textarea' },
        ]}
        apiBase="/api/admin/exam-campuses"
        formMode="modal"
      />

      <SimpleEntityManager
        title="Buildings"
        singularLabel="Building"
        items={buildings.map((building) => ({
          ...building,
          campusId: building.campusId,
        }))}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'code', label: 'Code' },
          { key: 'campusId', label: 'Campus' },
          { key: 'floors', label: 'Floors' },
        ]}
        fields={[
          {
            key: 'campusId',
            label: 'Campus',
            type: 'select',
            required: true,
            options: campuses.map((campus) => ({ value: campus.id, label: campus.name })),
          },
          { key: 'name', label: 'Building Name', type: 'text', required: true },
          { key: 'code', label: 'Building Code', type: 'text', required: true },
          { key: 'floors', label: 'Floors', type: 'number', required: true },
        ]}
        apiBase="/api/admin/exam-buildings"
        formMode="modal"
        canEdit={false}
        canDelete={false}
      />

      <SimpleEntityManager
        title="Rooms"
        singularLabel="Room"
        items={rooms.map((room) => ({
          ...room,
          campusId: room.campusId,
          buildingId: room.buildingId,
        }))}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'code', label: 'Code' },
          { key: 'capacity', label: 'Capacity' },
          { key: 'buildingId', label: 'Building' },
          { key: 'isMaintenance', label: 'Maintenance' },
        ]}
        fields={[
          {
            key: 'campusId',
            label: 'Campus',
            type: 'select',
            required: true,
            options: campuses.map((campus) => ({ value: campus.id, label: campus.name })),
          },
          {
            key: 'buildingId',
            label: 'Building',
            type: 'select',
            required: true,
            options: buildings.map((building) => ({
              value: building.id,
              label: building.name,
              meta: { campusId: building.campusId },
            })),
            dependsOn: ['campusId'],
          },
          { key: 'name', label: 'Room Name', type: 'text', required: true },
          { key: 'code', label: 'Room Code', type: 'text', required: true },
          { key: 'floorNumber', label: 'Floor', type: 'number', required: true },
          { key: 'capacity', label: 'Capacity', type: 'number', required: true },
          { key: 'isAccessible', label: 'Accessible', type: 'checkbox' },
          { key: 'isComputerLab', label: 'Computer Lab', type: 'checkbox' },
          { key: 'isPracticalLab', label: 'Practical Lab', type: 'checkbox' },
          { key: 'hasProjector', label: 'Projector', type: 'checkbox' },
          { key: 'hasInternet', label: 'Internet', type: 'checkbox' },
          { key: 'isMaintenance', label: 'Maintenance Mode', type: 'checkbox' },
          { key: 'maintenanceNotes', label: 'Maintenance Notes', type: 'textarea' },
        ]}
        apiBase="/api/admin/exam-rooms"
        formMode="modal"
        canEdit={false}
        canDelete={false}
      />
    </div>
  )
}

