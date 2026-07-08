/**
 * src/server/exam-timer.ts
 * 
 * Server-side exam timer management.
 * Timers run on the Node.js server — clients receive updates via Socket.IO.
 * This ensures students cannot manipulate remaining time client-side.
 */

type TimerState = {
  examId: string
  startedAt: number       // epoch ms
  durationMs: number
  isPaused: boolean
  pausedElapsed: number   // ms elapsed when paused
  interval: ReturnType<typeof setInterval> | null
  onTick: (remaining: number, elapsed: number) => void
  onEnd: () => void
}

// Global registry - one timer per live exam
const timers = new Map<string, TimerState>()

/**
 * Start a new server-authoritative timer for an exam.
 * Calls onTick every second with remaining/elapsed seconds.
 * Calls onEnd when duration expires.
 */
export function startExamTimer(
  examId: string,
  durationMinutes: number,
  onTick: (remaining: number, elapsed: number) => void,
  onEnd: () => void
): void {
  // Stop any existing timer for this exam
  stopExamTimer(examId)

  const durationMs = durationMinutes * 60 * 1000

  const state: TimerState = {
    examId,
    startedAt: Date.now(),
    durationMs,
    isPaused: false,
    pausedElapsed: 0,
    interval: null,
    onTick,
    onEnd,
  }

  state.interval = setInterval(() => {
    if (state.isPaused) return

    const elapsed = Date.now() - state.startedAt + state.pausedElapsed
    const remaining = Math.max(0, durationMs - elapsed)

    onTick(Math.floor(remaining / 1000), Math.floor(elapsed / 1000))

    if (remaining <= 0) {
      stopExamTimer(examId)
      onEnd()
    }
  }, 1000)

  timers.set(examId, state)
}

/**
 * Pause an active timer. Preserves elapsed time.
 */
export function pauseExamTimer(examId: string): number | null {
  const timer = timers.get(examId)
  if (!timer || timer.isPaused) return null

  const elapsed = Date.now() - timer.startedAt + timer.pausedElapsed
  timer.isPaused = true
  timer.pausedElapsed = elapsed

  return Math.floor((timer.durationMs - elapsed) / 1000)
}

/**
 * Resume a paused timer.
 */
export function resumeExamTimer(examId: string): void {
  const timer = timers.get(examId)
  if (!timer || !timer.isPaused) return

  timer.startedAt = Date.now()  // Reset start; pausedElapsed holds prior elapsed
  timer.isPaused = false
}

/**
 * Stop and remove a timer.
 */
export function stopExamTimer(examId: string): void {
  const timer = timers.get(examId)
  if (!timer) return
  if (timer.interval) clearInterval(timer.interval)
  timers.delete(examId)
}

/**
 * Get remaining seconds for a live exam.
 * Returns null if no timer found.
 */
export function getRemainingSeconds(examId: string): number | null {
  const timer = timers.get(examId)
  if (!timer) return null

  const elapsed = timer.isPaused
    ? timer.pausedElapsed
    : Date.now() - timer.startedAt + timer.pausedElapsed

  return Math.max(0, Math.floor((timer.durationMs - elapsed) / 1000))
}

/**
 * Check if a timer is currently running.
 */
export function isTimerActive(examId: string): boolean {
  return timers.has(examId)
}
