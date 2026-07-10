'use client'

import { formatCourseworkDeadline, formatCourseworkStatus, isCourseworkDeadlinePassed } from '@/lib/coursework'
import { useMemo, useState } from 'react'

type ScopeOption = {
  departmentName: string
  subjectId: string
  subjectName: string
  languageId: string
  languageName: string
  groupId: string
  groupName: string
  academicYearId: string
  academicYearName: string
  semesterId: string
  semesterName: string
}

type RuleOverview = {
  id: string
  departmentName: string
  subjectId: string
  subjectName: string
  languageId: string
  languageName: string
  groupId: string
  groupName: string
  academicYearId: string
  academicYearName: string
  semesterId: string
  semesterName: string
  rules: string
  submissionDeadline: string | null
  assignments: Array<{
    id: string
    studentName: string
    studentEmail: string
    title: string
    latestSubmission: {
      status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
      createdAt: string
    } | null
  }>
}

type Props = {
  scopeOptions: ScopeOption[]
  rules: RuleOverview[]
}

function statusBadge(status: 'PENDING' | 'ACCEPTED' | 'REJECTED') {
  if (status === 'ACCEPTED') return 'bg-emerald-100 text-emerald-700'
  if (status === 'REJECTED') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

export default function TeacherCourseworkOverview({ scopeOptions, rules }: Props) {
  const [academicYearId, setAcademicYearId] = useState(scopeOptions[0]?.academicYearId ?? '')
  const [semesterId, setSemesterId] = useState(scopeOptions.find((scope) => scope.academicYearId === (scopeOptions[0]?.academicYearId ?? ''))?.semesterId ?? '')
  const [groupId, setGroupId] = useState('')
  const [languageId, setLanguageId] = useState('')
  const [subjectId, setSubjectId] = useState('')

  const filteredByYear = useMemo(
    () => scopeOptions.filter((scope) => !academicYearId || scope.academicYearId === academicYearId),
    [scopeOptions, academicYearId]
  )
  const filteredBySemester = useMemo(
    () => filteredByYear.filter((scope) => !semesterId || scope.semesterId === semesterId),
    [filteredByYear, semesterId]
  )
  const filteredByGroup = useMemo(
    () => filteredBySemester.filter((scope) => !groupId || scope.groupId === groupId),
    [filteredBySemester, groupId]
  )
  const filteredByLanguage = useMemo(
    () => filteredByGroup.filter((scope) => !languageId || scope.languageId === languageId),
    [filteredByGroup, languageId]
  )

  const filteredRules = useMemo(() => {
    return rules.filter(
      (rule) =>
        (!academicYearId || rule.academicYearId === academicYearId) &&
        (!semesterId || rule.semesterId === semesterId) &&
        (!groupId || rule.groupId === groupId) &&
        (!languageId || rule.languageId === languageId) &&
        (!subjectId || rule.subjectId === subjectId)
    )
  }, [rules, academicYearId, semesterId, groupId, languageId, subjectId])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Course Work & Report Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          View which students received coursework titles under each year, group, department language, and subject scope.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-6">
          <label className="text-sm font-medium text-slate-700">
            Department
            <input
              type="text"
              value={scopeOptions[0]?.departmentName ?? ''}
              readOnly
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Academic Year
            <select
              value={academicYearId}
              onChange={(event) => {
                setAcademicYearId(event.target.value)
                setSemesterId('')
                setGroupId('')
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              {[...new Map(scopeOptions.map((scope) => [scope.academicYearId, scope])).values()].map((scope) => (
                <option key={scope.academicYearId} value={scope.academicYearId}>
                  {scope.academicYearName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Semester
            <select
              value={semesterId}
              onChange={(event) => {
                setSemesterId(event.target.value)
                setGroupId('')
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select semester</option>
              {[...new Map(filteredByYear.map((scope) => [scope.semesterId, scope])).values()].map((scope) => (
                <option key={scope.semesterId} value={scope.semesterId}>
                  {scope.semesterName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Group
            <select
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value)
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select group</option>
              {[...new Map(filteredBySemester.map((scope) => [scope.groupId, scope])).values()].map((scope) => (
                <option key={scope.groupId} value={scope.groupId}>
                  {scope.groupName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Department Language
            <select
              value={languageId}
              onChange={(event) => {
                setLanguageId(event.target.value)
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select language</option>
              {[...new Map(filteredByGroup.map((scope) => [scope.languageId, scope])).values()].map((scope) => (
                <option key={scope.languageId} value={scope.languageId}>
                  {scope.languageName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Subject
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select subject</option>
              {[...new Map(filteredByLanguage.map((scope) => [scope.subjectId, scope])).values()].map((scope) => (
                <option key={scope.subjectId} value={scope.subjectId}>
                  {scope.subjectName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {filteredRules.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No coursework rules were created for the selected filters yet.
        </section>
      ) : (
        <div className="space-y-6">
          {filteredRules.map((rule) => {
            const acceptedCount = rule.assignments.filter((assignment) => assignment.latestSubmission?.status === 'ACCEPTED').length
            const pendingCount = rule.assignments.filter((assignment) => assignment.latestSubmission?.status === 'PENDING').length
            const rejectedCount = rule.assignments.filter((assignment) => assignment.latestSubmission?.status === 'REJECTED').length

            return (
              <section key={rule.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-6 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">
                        {rule.subjectName} · {rule.languageName} · {rule.academicYearName} · {rule.semesterName}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Department: {rule.departmentName} · Group: {rule.groupName}
                      </p>
                    </div>
                    <div className="text-sm text-slate-500">
                      <p>Deadline: {formatCourseworkDeadline(rule.submissionDeadline)}</p>
                      {rule.submissionDeadline ? (
                        <p className={isCourseworkDeadlinePassed(rule.submissionDeadline) ? 'text-rose-600' : 'text-emerald-600'}>
                          {isCourseworkDeadlinePassed(rule.submissionDeadline) ? 'Deadline passed' : 'Deadline active'}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Assigned</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{rule.assignments.length}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-emerald-500">Accepted</p>
                      <p className="mt-2 text-2xl font-semibold text-emerald-700">{acceptedCount}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-amber-500">Pending</p>
                      <p className="mt-2 text-2xl font-semibold text-amber-700">{pendingCount}</p>
                    </div>
                    <div className="rounded-2xl bg-rose-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-rose-500">Rejected</p>
                      <p className="mt-2 text-2xl font-semibold text-rose-700">{rejectedCount}</p>
                    </div>
                  </div>
                </div>

                <div className="border-b border-slate-100 px-6 py-5">
                  <p className="text-sm font-semibold text-slate-900">Shared Rules</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{rule.rules}</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <th className="px-6 py-4">Student</th>
                        <th className="px-6 py-4">Title</th>
                        <th className="px-6 py-4">Submission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {rule.assignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td className="px-6 py-4">
                            <p className="font-medium text-slate-900">{assignment.studentName}</p>
                            <p className="text-sm text-slate-500">{assignment.studentEmail}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{assignment.title}</td>
                          <td className="px-6 py-4">
                            {assignment.latestSubmission ? (
                              <div className="space-y-2">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(assignment.latestSubmission.status)}`}>
                                  {formatCourseworkStatus(assignment.latestSubmission.status)}
                                </span>
                                <p className="text-xs text-slate-400">
                                  {new Date(assignment.latestSubmission.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">Not submitted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
