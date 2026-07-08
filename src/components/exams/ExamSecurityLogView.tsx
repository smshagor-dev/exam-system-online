type AttemptSummary = {
  id: string
  status: string
  warningCount: number
  tabSwitchCount: number
  reconnectCount: number
  student: {
    user: {
      name: string
      email: string
    }
  }
}

type ActivityLogItem = {
  id: string
  action: string
  createdAt: Date
  details: string | null
  user: {
    name: string
    email: string
  }
}

type Props = {
  exam: {
    id: string
    title: string
    department: { name: string }
    subject: { name: string }
  }
  attempts: AttemptSummary[]
  logs: ActivityLogItem[]
}

function parseDetails(details: string | null) {
  if (!details) return null

  try {
    return JSON.parse(details) as Record<string, unknown>
  } catch {
    return null
  }
}

export default function ExamSecurityLogView({ exam, attempts, logs }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Exam Security Logs</h1>
        <p className="mt-1 text-gray-500">
          {exam.title} · {exam.department.name} · {exam.subject.name}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Attempts</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{attempts.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Students Warned</p>
          <p className="mt-2 text-3xl font-bold text-orange-600">
            {attempts.filter((attempt) => attempt.warningCount > 0).length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Auto Submitted</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {attempts.filter((attempt) => attempt.status === 'AUTO_SUBMITTED').length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Log Events</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">{logs.length}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Attempt Warning Summary</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-5 py-3">Student</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Warnings</th>
              <th className="px-5 py-3">Tab Switches</th>
              <th className="px-5 py-3">Reconnects</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {attempts.map((attempt) => (
              <tr key={attempt.id} className="hover:bg-gray-50">
                <td className="px-5 py-4">
                  <p className="text-sm font-medium text-gray-900">{attempt.student.user.name}</p>
                  <p className="text-xs text-gray-400">{attempt.student.user.email}</p>
                </td>
                <td className="px-5 py-4 text-sm text-gray-700">{attempt.status.replace('_', ' ')}</td>
                <td className="px-5 py-4 text-sm font-medium text-orange-600">{attempt.warningCount}</td>
                <td className="px-5 py-4 text-sm text-gray-700">{attempt.tabSwitchCount}</td>
                <td className="px-5 py-4 text-sm text-gray-700">{attempt.reconnectCount}</td>
              </tr>
            ))}
            {attempts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                  No attempts recorded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Security Event Timeline</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map((log) => {
              const details = parseDetails(log.details)

              return (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-gray-900">{log.user.name}</p>
                    <p className="text-xs text-gray-400">{log.user.email}</p>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-gray-800">
                    {log.action.replaceAll('_', ' ')}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    {details ? (
                      <div className="space-y-1">
                        {Object.entries(details).map(([key, value]) => (
                          <p key={key}>
                            <span className="font-medium text-gray-700">{key}:</span> {String(value)}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span>No extra details</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                  No security logs recorded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
