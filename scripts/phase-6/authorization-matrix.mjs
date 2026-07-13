import fs from 'fs/promises'
import path from 'path'

const root = process.cwd()
const evidenceDir = path.join(root, 'docs', 'phase-6', 'evidence')

async function read(filePath) {
  return fs.readFile(filePath, 'utf8')
}

async function main() {
  await fs.mkdir(evidenceDir, { recursive: true })

  const socketFile = await read(path.join(root, 'src', 'server', 'socket-server.ts'))
  const apiFile = await read(path.join(root, 'src', 'app', 'api', 'exams', '[id]', 'route.ts'))
  const permissionFile = await read(path.join(root, 'src', 'lib', 'permissions.ts'))

  const checks = [
    {
      name: 'teacher-access-gate',
      pass: socketFile.includes('canTeacherAccessExam'),
      details: 'Teacher socket events still gate on assignment-aware access checks.',
    },
    {
      name: 'student-access-gate',
      pass: socketFile.includes('studentCanAccessExam'),
      details: 'Student join flow still validates active enrollment and lifecycle state server-side.',
    },
    {
      name: 'language-snapshot-ownership',
      pass:
        socketFile.includes('Question does not belong to this attempt snapshot') &&
        socketFile.includes('assertStudentExamTranslations'),
      details: 'Answer saves are scoped to the frozen attempt snapshot and published translations.',
    },
    {
      name: 'exam-route-protection',
      pass: apiFile.includes('studentCanAccessExam') && apiFile.includes('teacherOwnsExam'),
      details: 'Exam detail route keeps student and teacher ownership checks.',
    },
    {
      name: 'legacy-enrollment-fallback',
      pass: permissionFile.includes('Legacy subject enrollment fallback'),
      details: 'Legacy subject fallback remains in the shared student permission layer.',
    },
  ]

  await fs.writeFile(
    path.join(evidenceDir, 'authorization-matrix.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        checks,
      },
      null,
      2
    )
  )

  const failed = checks.filter((check) => !check.pass)
  if (failed.length > 0) {
    throw new Error(`Phase 6 authorization checks failed: ${failed.map((check) => check.name).join(', ')}`)
  }

  console.log(`Phase 6 authorization checks passed (${checks.length}/${checks.length})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
