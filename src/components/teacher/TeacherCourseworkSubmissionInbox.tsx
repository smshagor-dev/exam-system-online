'use client'

type AttemptRow = {
  id: string
  publicationId: string
  title: string
  attemptNumber: number
  status: string
  submissionType: string
  isLate: boolean
  latePenaltyApplied: number | null
  studentName: string
  studentEmail: string
  submittedAt: string | null
  teacherLocked: boolean
  attachments: Array<{
    id: string
    fileName: string
    downloadUrl: string
    fileSizeBytes: number
    mimeType: string
    malwareStatus: string
  }>
  latestGrade: {
    id: string
    status: string
    totalScore: number
    percentage: number
  } | null
}

type Props = {
  attempts: AttemptRow[]
}

export default function TeacherCourseworkSubmissionInbox({ attempts }: Props) {
  return (
    <div className="space-y-6">
      {attempts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No enterprise coursework attempts yet.
        </div>
      ) : null}
      {attempts.map((attempt) => (
        <section key={attempt.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{attempt.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {attempt.studentName} | {attempt.studentEmail}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Attempt {attempt.attemptNumber} | {attempt.submissionType.replaceAll('_', ' ')} | Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : 'draft'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{attempt.status}</span>
              {attempt.isLate ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700">Late</span> : null}
              {attempt.teacherLocked ? <span className="rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-700">Locked</span> : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Penalty</p>
              <p className="mt-2">{attempt.latePenaltyApplied ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Attachments</p>
              <p className="mt-2">{attempt.attachments.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Grade</p>
              <p className="mt-2">{attempt.latestGrade ? `${attempt.latestGrade.totalScore} (${attempt.latestGrade.status})` : 'Not graded'}</p>
            </div>
          </div>

          {attempt.attachments.length > 0 ? (
            <div className="mt-4 space-y-3">
              {attempt.attachments.map((attachment) => (
                <div key={attachment.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{attachment.fileName}</p>
                      <p className="text-xs text-slate-500">{attachment.mimeType} | {attachment.fileSizeBytes} bytes | scan: {attachment.malwareStatus}</p>
                    </div>
                    <a href={attachment.downloadUrl} className="text-sm font-medium text-sky-600 hover:text-sky-700">
                      Open attachment
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}
