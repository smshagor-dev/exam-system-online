'use client'

import { use, useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { getSocket } from '@/lib/socket'
import type { Socket } from 'socket.io-client'

type StudentStatus = {
  userId: string
  studentId: string
  socketId: string
  name: string
  online: boolean
  submitted: boolean
  tabSwitches: number
  reconnects: number
}

type Props = {
  params: Promise<{ id: string }>
}

export default function LiveExamMonitor({ params }: Props) {
  const { data: session } = useSession()
  const { id: examId } = use(params)
  const [students, setStudents] = useState<StudentStatus[]>([])
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [examStatus, setExamStatus] = useState<'idle' | 'live' | 'paused' | 'ended'>('idle')
  const [exam, setExam] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const socketRef = useRef<any>(null)

  useEffect(() => {
    fetch(`/api/exams/${examId}`).then((r) => r.json()).then((d) => {
      setExam(d)
      if (d.status === 'LIVE') setExamStatus('live')
      setLoading(false)
    })
  }, [examId])

  useEffect(() => {
    if (!session?.user) return
    // We need the session JWT token for socket auth
    // In NextAuth v5, we'd get it from the session or use a dedicated endpoint
    fetch('/api/socket/token').then((r) => r.json()).then(({ token }) => {
      const socket = getSocket(token)
      socketRef.current = socket

      socket.on('exam:student_joined', (data) => {
        if (data.examId !== examId) return
        setStudents((prev) => {
          const exists = prev.find((s) => s.userId === data.userId)
          if (exists) return prev.map((s) => s.userId === data.userId ? { ...s, online: true, socketId: data.socketId } : s)
          return [...prev, {
            userId: data.userId,
            studentId: data.studentId,
            socketId: data.socketId,
            name: data.studentName,
            online: true,
            submitted: false,
            tabSwitches: 0,
            reconnects: data.reconnected ? 1 : 0,
          }]
        })
      })

      socket.on('exam:student_offline', (data) => {
        if (data.examId !== examId) return
        setStudents((prev) => prev.map((s) => s.socketId === data.socketId ? { ...s, online: false } : s))
      })

      socket.on('exam:timer_update', (data) => {
        if (data.examId === examId) setRemainingSeconds(data.remaining)
      })

      socket.on('exam:started', (data) => {
        if (data.examId === examId) setExamStatus('live')
      })

      socket.on('exam:paused', (data) => {
        if (data.examId === examId) setExamStatus('paused')
      })

      socket.on('exam:ended', (data) => {
        if (data.examId === examId) setExamStatus('ended')
      })

      socket.on('exam:suspicious_activity', (data) => {
        setStudents((prev) =>
          prev.map((s) => {
            if (s.studentId === data.studentId) {
              return data.type === 'TAB_SWITCH'
                ? { ...s, tabSwitches: data.count }
                : { ...s, reconnects: data.count }
            }
            return s
          })
        )
      })

      // Join teacher room
      socket.emit('teacher:start_exam' as any, { examId }) // just join the room - or use a separate join event
    })

    return () => { socketRef.current?.disconnect() }
  }, [session, examId])

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
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading exam...</div>

  const onlineCount = students.filter((s) => s.online).length
  const submittedCount = students.filter((s) => s.submitted).length
  const suspiciousCount = students.filter((s) => s.tabSwitches > 2).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Monitoring</h1>
          <p className="text-gray-500">{exam?.title}</p>
        </div>
        <div className="flex gap-3">
          {examStatus === 'idle' && (
            <button onClick={handleStartExam}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
              ▶ Start Exam
            </button>
          )}
          {examStatus === 'live' && (
            <>
              <button onClick={handlePauseExam}
                className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-semibold hover:bg-yellow-600">
                ⏸ Pause
              </button>
              <button onClick={handleEndExam}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">
                ⏹ End Exam
              </button>
            </>
          )}
          {examStatus === 'paused' && (
            <button onClick={handleStartExam}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
              ▶ Resume
            </button>
          )}
          {examStatus === 'ended' && (
            <span className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium">Exam Ended</span>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className={`text-3xl font-bold ${remainingSeconds !== null && remainingSeconds < 300 ? 'text-red-500 animate-pulse' : 'text-gray-900'}`}>
            {remainingSeconds !== null ? formatTime(remainingSeconds) : '--:--'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Time Remaining</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{students.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Joined</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{onlineCount}</p>
          <p className="text-xs text-gray-500 mt-1">Online</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{submittedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Submitted</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-orange-600">{suspiciousCount}</p>
          <p className="text-xs text-gray-500 mt-1">Suspicious</p>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${examStatus === 'live' ? 'bg-green-500 animate-pulse' : examStatus === 'paused' ? 'bg-yellow-500' : 'bg-gray-400'}`} />
        <span className="text-sm font-medium text-gray-700 uppercase tracking-wide">
          {examStatus === 'live' ? 'Live' : examStatus === 'paused' ? 'Paused' : examStatus === 'ended' ? 'Ended' : 'Not Started'}
        </span>
      </div>

      {/* Student Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Student Activity</h2>
        </div>
        {students.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p>No students have joined yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {students.map((student) => (
              <div key={student.userId}
                className={`rounded-xl border-2 p-4 transition ${
                  student.submitted ? 'border-green-200 bg-green-50'
                  : !student.online ? 'border-gray-200 bg-gray-50 opacity-60'
                  : student.tabSwitches > 2 ? 'border-orange-200 bg-orange-50'
                  : 'border-gray-200 bg-white'
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${student.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <p className="font-medium text-sm text-gray-900">{student.name}</p>
                  </div>
                  {student.submitted && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      Submitted
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-3 text-xs text-gray-500">
                  {student.tabSwitches > 0 && (
                    <span className={student.tabSwitches > 2 ? 'text-orange-600 font-medium' : ''}>
                      ⚠️ {student.tabSwitches} tab switch{student.tabSwitches > 1 ? 'es' : ''}
                    </span>
                  )}
                  {student.reconnects > 0 && (
                    <span>🔄 {student.reconnects} reconnect{student.reconnects > 1 ? 's' : ''}</span>
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
