'use client'

import { use, useEffect, useRef, useState } from 'react'
import { getSocket, type AppSocket } from '@/lib/socket'
import type { ServerToClientEvents } from '@/types/socket'

type StudentStatus = {
  userId: string
  studentId: string
  socketId: string
  name: string
  online: boolean
  submitted: boolean
  submittedAtMs: number | null
  attemptStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'TIMED_OUT' | null
  tabSwitches: number
  reconnects: number
  warnings: number
  lastViolation?: string
}

type Props = {
  params: Promise<{ id: string }>
}

type ExamDetails = {
  title: string
  status: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED'
}

type StudentJoinedEvent = Parameters<ServerToClientEvents['exam:student_joined']>[0]
type StudentOfflineEvent = Parameters<ServerToClientEvents['exam:student_offline']>[0]
type StudentSubmittedEvent = Parameters<ServerToClientEvents['exam:student_submitted']>[0]
type TimerUpdateEvent = Parameters<ServerToClientEvents['exam:timer_update']>[0]
type ExamStartedEvent = Parameters<ServerToClientEvents['exam:started']>[0]
type ExamPausedEvent = Parameters<ServerToClientEvents['exam:paused']>[0]
type ExamEndedEvent = Parameters<ServerToClientEvents['exam:ended']>[0]
type SuspiciousActivityEvent = Parameters<ServerToClientEvents['exam:suspicious_activity']>[0]
type MonitorSnapshotEvent = Parameters<ServerToClientEvents['exam:monitor_snapshot']>[0]

export default function LiveExamMonitor({ params }: Props) {
  const { id: examId } = use(params)
  const [students, setStudents] = useState<StudentStatus[]>([])
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [examStatus, setExamStatus] = useState<'idle' | 'live' | 'paused' | 'ended'>('idle')
  const [exam, setExam] = useState<ExamDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [runtimeMode, setRuntimeMode] = useState<'memory' | 'redis'>('memory')
  const socketRef = useRef<AppSocket | null>(null)

  useEffect(() => {
    fetch(`/api/exams/${examId}`).then((r) => r.json()).then((data) => {
      setExam(data)
      if (data.status === 'LIVE') setExamStatus('live')
      setLoading(false)
    })
  }, [examId])

  useEffect(() => {
    fetch('/api/socket/token').then((r) => r.json()).then(({ token }) => {
      const socket = getSocket(token)
      socketRef.current = socket

      socket.on('exam:student_joined', (data: StudentJoinedEvent) => {
        if (data.examId !== examId) return
        setStudents((prev) => {
          const exists = prev.find((student) => student.userId === data.userId)
          if (exists) {
            return prev.map((student) =>
              student.userId === data.userId
                ? { ...student, online: true, socketId: data.socketId }
                : student
            )
          }

          return [
            ...prev,
            {
              userId: data.userId,
              studentId: data.studentId,
              socketId: data.socketId,
              name: data.studentName,
              online: true,
              submitted: false,
              submittedAtMs: null,
              attemptStatus: 'IN_PROGRESS',
              tabSwitches: 0,
              reconnects: data.reconnected ? 1 : 0,
              warnings: 0,
            },
          ]
        })
      })

      socket.on('exam:student_offline', (data: StudentOfflineEvent) => {
        if (data.examId !== examId) return
        setStudents((prev) =>
          prev.map((student) =>
            student.socketId === data.socketId ? { ...student, online: false } : student
          )
        )
      })

      socket.on('exam:student_submitted', (data: StudentSubmittedEvent) => {
        if (data.examId !== examId) return
        setStudents((prev) =>
          prev.map((student) =>
            student.studentId === data.studentId
              ? {
                  ...student,
                  submitted: true,
                  submittedAtMs: Date.now(),
                  attemptStatus: data.status,
                  online: data.status === 'AUTO_SUBMITTED' ? false : student.online,
                }
              : student
          )
        )
      })

      socket.on('exam:timer_update', (data: TimerUpdateEvent) => {
        if (data.examId === examId) setRemainingSeconds(data.remaining)
      })

      socket.on('exam:started', (data: ExamStartedEvent) => {
        if (data.examId === examId) setExamStatus('live')
      })

      socket.on('exam:paused', (data: ExamPausedEvent) => {
        if (data.examId === examId) setExamStatus('paused')
      })

      socket.on('exam:ended', (data: ExamEndedEvent) => {
        if (data.examId === examId) setExamStatus('ended')
      })

      socket.on('exam:suspicious_activity', (data: SuspiciousActivityEvent) => {
        setStudents((prev) =>
          prev.map((student) => {
            if (student.studentId !== data.studentId) return student

            if (data.type === 'TAB_SWITCH') {
              return {
                ...student,
                tabSwitches: data.count,
                warnings: data.warningCount ?? student.warnings,
                lastViolation: data.type,
              }
            }

            if (data.type === 'RECONNECT') {
              return {
                ...student,
                reconnects: data.count,
                warnings: data.warningCount ?? student.warnings,
                lastViolation: data.type,
              }
            }

            return {
              ...student,
              warnings: data.warningCount ?? student.warnings,
              lastViolation: data.type,
            }
          })
        )
      })

      socket.on('exam:monitor_snapshot', (data: MonitorSnapshotEvent) => {
        if (data.examId !== examId) return
        setRuntimeMode(data.runtime.mode)
        if (data.runtime.status === 'live') setExamStatus('live')
        if (data.runtime.status === 'paused') setExamStatus('paused')
        if (data.runtime.status === 'ended') setExamStatus('ended')
        if (typeof data.runtime.remainingSeconds === 'number') {
          setRemainingSeconds(data.runtime.remainingSeconds)
        }
        setStudents(
          data.students.map((student) => ({
            userId: student.userId,
            studentId: student.studentId,
            socketId: student.socketId ?? '',
            name: student.studentName,
            online: student.online,
            submitted: student.submitted,
            submittedAtMs: student.submittedAtMs,
            attemptStatus: student.attemptStatus,
            tabSwitches: student.tabSwitches,
            reconnects: student.reconnects,
            warnings: student.warnings,
            lastViolation: student.lastViolation ?? undefined,
          }))
        )
      })

      socket.emit('teacher:join_exam_monitor', { examId })
    })

    return () => {
      socketRef.current?.disconnect()
    }
  }, [examId])

  const handleStartExam = () => {
    socketRef.current?.emit('teacher:start_exam', { examId })
  }

  const handlePauseExam = () => {
    socketRef.current?.emit('teacher:pause_exam', { examId })
    setExamStatus('paused')
  }

  const handleEndExam = () => {
    if (!confirm('End this exam? All students will be auto-submitted.')) return
    socketRef.current?.emit('teacher:end_exam', { examId })
    setExamStatus('ended')
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }

    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  if (loading) return <div className="py-20 text-center text-gray-400">Loading exam...</div>

  const onlineCount = students.filter((student) => student.online).length
  const submittedCount = students.filter((student) => student.submitted).length
  const suspiciousCount = students.filter((student) => student.warnings > 0).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Monitoring</h1>
          <p className="text-gray-500">{exam?.title}</p>
        </div>
        <div className="flex gap-3">
          {examStatus === 'idle' && (
            <button
              onClick={handleStartExam}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Start Exam
            </button>
          )}
          {examStatus === 'live' && (
            <>
              <button
                onClick={handlePauseExam}
                className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600"
              >
                Pause
              </button>
              <button
                onClick={handleEndExam}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                End Exam
              </button>
            </>
          )}
          {examStatus === 'paused' && (
            <button
              onClick={handleStartExam}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Resume
            </button>
          )}
          {examStatus === 'ended' && (
            <span className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">
              Exam Ended
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className={`text-3xl font-bold ${remainingSeconds !== null && remainingSeconds < 300 ? 'animate-pulse text-red-500' : 'text-gray-900'}`}>
            {remainingSeconds !== null ? formatTime(remainingSeconds) : '--:--'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Time Remaining</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{students.length}</p>
          <p className="mt-1 text-xs text-gray-500">Total Joined</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{onlineCount}</p>
          <p className="mt-1 text-xs text-gray-500">Online</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{submittedCount}</p>
          <p className="mt-1 text-xs text-gray-500">Submitted</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-orange-600">{suspiciousCount}</p>
          <p className="mt-1 text-xs text-gray-500">Suspicious</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            examStatus === 'live'
              ? 'animate-pulse bg-green-500'
              : examStatus === 'paused'
              ? 'bg-yellow-500'
              : 'bg-gray-400'
          }`}
        />
        <span className="text-sm font-medium uppercase tracking-wide text-gray-700">
          {examStatus === 'live'
            ? 'Live'
            : examStatus === 'paused'
            ? 'Paused'
            : examStatus === 'ended'
            ? 'Ended'
            : 'Not Started'}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
          Runtime: {runtimeMode}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <h2 className="font-semibold text-gray-900">Student Activity</h2>
        </div>
        {students.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="mb-3 text-4xl">Users</p>
            <p>No students have joined yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
            {students.map((student) => (
              <div
                key={student.userId}
                className={`rounded-xl border-2 p-4 transition ${
                  student.submitted
                    ? 'border-green-200 bg-green-50'
                    : !student.online
                    ? 'border-gray-200 bg-gray-50 opacity-60'
                    : student.warnings >= 3
                    ? 'border-red-200 bg-red-50'
                    : student.warnings > 0
                    ? 'border-orange-200 bg-orange-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${student.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <p className="text-sm font-medium text-gray-900">{student.name}</p>
                  </div>
                  {student.submitted && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Submitted
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                  {student.attemptStatus && (
                    <span>Status: {student.attemptStatus.replaceAll('_', ' ')}</span>
                  )}
                  {student.submittedAtMs && (
                    <span>Submitted: {new Date(student.submittedAtMs).toLocaleTimeString()}</span>
                  )}
                  {student.tabSwitches > 0 && (
                    <span className={student.tabSwitches > 2 ? 'font-medium text-orange-600' : ''}>
                      Tab switches: {student.tabSwitches}
                    </span>
                  )}
                  {student.reconnects > 0 && (
                    <span>Reconnects: {student.reconnects}</span>
                  )}
                  {student.warnings > 0 && (
                    <span className={student.warnings >= 3 ? 'font-semibold text-red-600' : 'font-medium text-orange-600'}>
                      Warnings: {student.warnings}/3
                    </span>
                  )}
                  {student.lastViolation && student.lastViolation !== 'RECONNECT' && (
                    <span>Last: {student.lastViolation.replace('_', ' ')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
