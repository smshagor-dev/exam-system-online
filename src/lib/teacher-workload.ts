import { TeacherWorkloadCategory } from '@prisma/client/index'

export type WorkloadPolicyConfig = {
  maxWeeklyHours?: number | null
  maxSemesterHours?: number | null
  defaultLectureWeight?: number | null
  defaultLabWeight?: number | null
  defaultAssessmentWeight?: number | null
}

export type AssignmentWorkloadInput = {
  weeklyHours?: number | null
  lectureHours?: number | null
  labHours?: number | null
  consultationHours?: number | null
  assessmentHours?: number | null
}

export type WorkloadEntryLike = {
  category: TeacherWorkloadCategory
  hours: number
}

export function calculateAssignmentWorkload(
  assignment: AssignmentWorkloadInput,
  policy: WorkloadPolicyConfig = {}
) {
  const lectureWeight = policy.defaultLectureWeight ?? 1
  const labWeight = policy.defaultLabWeight ?? 1
  const assessmentWeight = policy.defaultAssessmentWeight ?? 1

  const lectureHours = (assignment.lectureHours ?? 0) * lectureWeight
  const labHours = (assignment.labHours ?? 0) * labWeight
  const consultationHours = assignment.consultationHours ?? 0
  const assessmentHours = (assignment.assessmentHours ?? 0) * assessmentWeight
  const explicitWeeklyHours = assignment.weeklyHours ?? 0

  const totalHours = lectureHours + labHours + consultationHours + assessmentHours + explicitWeeklyHours

  return {
    totalHours,
    breakdown: {
      [TeacherWorkloadCategory.LECTURE]: lectureHours,
      [TeacherWorkloadCategory.LAB]: labHours,
      [TeacherWorkloadCategory.CONSULTATION]: consultationHours,
      [TeacherWorkloadCategory.ASSESSMENT]: assessmentHours,
      [TeacherWorkloadCategory.OTHER]: explicitWeeklyHours,
    },
  }
}

export function calculateTeacherWeeklyWorkload(
  assignments: AssignmentWorkloadInput[],
  entries: WorkloadEntryLike[] = [],
  policy: WorkloadPolicyConfig = {}
) {
  const assignmentTotals = assignments.map((assignment) => calculateAssignmentWorkload(assignment, policy))
  const assignmentHours = assignmentTotals.reduce((sum, item) => sum + item.totalHours, 0)
  const manualHours = entries.reduce((sum, entry) => sum + entry.hours, 0)
  const totalHours = assignmentHours + manualHours

  return {
    totalHours,
    assignmentHours,
    manualHours,
    overLimit: policy.maxWeeklyHours != null ? totalHours > policy.maxWeeklyHours : false,
  }
}

export function calculateTeacherSemesterWorkload(entries: WorkloadEntryLike[], policy: WorkloadPolicyConfig = {}) {
  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0)
  return {
    totalHours,
    overLimit: policy.maxSemesterHours != null ? totalHours > policy.maxSemesterHours : false,
  }
}

export function validateWorkloadLimit(totalHours: number, limit?: number | null) {
  if (limit == null) {
    return { allowed: true, overBy: 0 }
  }

  return {
    allowed: totalHours <= limit,
    overBy: totalHours > limit ? totalHours - limit : 0,
  }
}

export function getWorkloadBreakdown(entries: WorkloadEntryLike[]) {
  return entries.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.category] = (accumulator[entry.category] ?? 0) + entry.hours
    return accumulator
  }, {})
}

export function detectAssignmentConflicts(input: {
  weeklyHours: number
  maxWeeklyHours?: number | null
  assignments: Array<{ academicOfferingId?: string | null; startsAt?: Date | null; endsAt?: Date | null }>
}) {
  const conflicts: Array<{ severity: 'ERROR' | 'WARNING' | 'INFORMATION'; message: string }> = []

  if (input.maxWeeklyHours != null && input.weeklyHours > input.maxWeeklyHours) {
    conflicts.push({
      severity: 'ERROR',
      message: `Teacher workload exceeds weekly limit by ${Math.round((input.weeklyHours - input.maxWeeklyHours) * 100) / 100} hours`,
    })
  }

  const seenOfferings = new Set<string>()
  for (const assignment of input.assignments) {
    if (assignment.academicOfferingId && seenOfferings.has(assignment.academicOfferingId)) {
      conflicts.push({
        severity: 'WARNING',
        message: `Teacher has multiple active assignments for offering ${assignment.academicOfferingId}`,
      })
    }
    if (assignment.academicOfferingId) {
      seenOfferings.add(assignment.academicOfferingId)
    }
  }

  return conflicts
}
