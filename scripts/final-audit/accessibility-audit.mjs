import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'
import { PrismaClient } from '@prisma/client'
import {
  loginPage,
  primeLocale,
  startRedis,
  startServer,
  stopRedis,
  stopServer,
} from '../phase-6/evidence-helpers.mjs'

const prisma = new PrismaClient()
const auditDir = path.join(process.cwd(), 'docs', 'final-audit')
const evidenceDir = path.join(auditDir, 'evidence', 'accessibility')
const browserDir = path.join(evidenceDir, 'browser')
const consoleDir = path.join(evidenceDir, 'console')
const dataDir = path.join(evidenceDir, 'data')
const summaryPath = path.join(dataDir, 'accessibility-summary.json')

function rel(filePath) {
  return filePath.replace(`${process.cwd()}${path.sep}`, '').replaceAll('\\', '/')
}

async function ensureDirs() {
  await Promise.all([browserDir, consoleDir, dataDir].map((dir) => fs.mkdir(dir, { recursive: true })))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
  return rel(filePath)
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
  return rel(filePath)
}

async function gatherFixtures() {
  const cse = await prisma.department.findFirstOrThrow({
    where: { code: 'CSE' },
    include: { admin: true },
  })
  const offering = await prisma.academicOffering.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      isActive: true,
      teachingAssignments: { some: { status: 'ACTIVE' } },
      studentSubjects: { some: {} },
    },
    include: {
      teachingAssignments: {
        where: { status: 'ACTIVE' },
        include: { teacher: { include: { user: true } } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
      },
    },
  })
  const teacher = offering.teachingAssignments[0]?.teacher
  if (!teacher) {
    throw new Error('No active teacher fixture found for accessibility audit.')
  }
  const student = await prisma.studentProfile.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      subjects: { some: { academicOfferingId: offering.id } },
    },
    include: { user: true },
  })
  const course = await prisma.phase10Course.findFirst({
    where: {
      academicOfferingId: offering.id,
      publishedAt: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return {
    admin: cse.admin,
    teacher: teacher.user,
    student: student.user,
    courseId: course?.id ?? null,
  }
}

async function inspectPage(page, definition) {
  const consoleMessages = []
  const pageErrors = []

  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.stack || error))
  })

  await page.goto(definition.url, { waitUntil: 'networkidle' })

  const analysis = await page.evaluate(async () => {
    function textOf(node) {
      return (node?.textContent || '').replace(/\s+/g, ' ').trim()
    }

    function parseColor(input) {
      const match = input.match(/rgba?\(([^)]+)\)/i)
      if (!match) return null
      const parts = match[1].split(',').map((part) => Number(part.trim()))
      return {
        r: parts[0] ?? 0,
        g: parts[1] ?? 0,
        b: parts[2] ?? 0,
        a: parts[3] ?? 1,
      }
    }

    function luminanceChannel(channel) {
      const value = channel / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }

    function contrastRatio(foreground, background) {
      const lumA = 0.2126 * luminanceChannel(foreground.r) + 0.7152 * luminanceChannel(foreground.g) + 0.0722 * luminanceChannel(foreground.b)
      const lumB = 0.2126 * luminanceChannel(background.r) + 0.7152 * luminanceChannel(background.g) + 0.0722 * luminanceChannel(background.b)
      const lighter = Math.max(lumA, lumB)
      const darker = Math.min(lumA, lumB)
      return Number((((lighter + 0.05) / (darker + 0.05))).toFixed(2))
    }

    function nearestOpaqueBackground(element) {
      let current = element
      while (current) {
        const style = window.getComputedStyle(current)
        const parsed = parseColor(style.backgroundColor)
        if (parsed && parsed.a === 1) {
          return parsed
        }
        current = current.parentElement
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }

    function labelTextFor(element) {
      const ariaLabel = element.getAttribute('aria-label')
      if (ariaLabel?.trim()) return ariaLabel.trim()

      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => textOf(document.getElementById(id)))
          .filter(Boolean)
          .join(' ')
          .trim()
        if (text) return text
      }

      const id = element.getAttribute('id')
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`)
        if (label && textOf(label)) return textOf(label)
      }

      const parentLabel = element.closest('label')
      if (parentLabel && textOf(parentLabel)) return textOf(parentLabel)

      const placeholder = element.getAttribute('placeholder')
      if (placeholder?.trim()) return placeholder.trim()

      const title = element.getAttribute('title')
      if (title?.trim()) return title.trim()

      const value = element.getAttribute('value')
      if (value?.trim()) return value.trim()

      return textOf(element)
    }

    const selectors = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'
    const interactive = [...document.querySelectorAll(selectors)]
      .filter((element) => {
        const html = element
        const style = window.getComputedStyle(html)
        const rect = html.getBoundingClientRect()
        return !html.hasAttribute('disabled') &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
      })

    const missingNames = interactive
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || null,
        role: element.getAttribute('role') || null,
        name: labelTextFor(element),
      }))
      .filter((item) => !item.name)

    const focusOrder = []
    const seen = new Set()
    if (document.body) {
      document.body.focus?.()
    }
    for (let index = 0; index < 12; index += 1) {
      const active = document.activeElement
      const descriptor = active
        ? `${active.tagName.toLowerCase()}#${active.getAttribute('id') || ''}.${active.getAttribute('class') || ''}`.trim()
        : 'none'
      if (!seen.has(descriptor)) {
        focusOrder.push(descriptor)
        seen.add(descriptor)
      }
      const keyboardEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
      document.dispatchEvent(keyboardEvent)
    }

    const realFocusOrder = []
    const focusables = interactive.slice(0, 12)
    for (const element of focusables) {
      element.focus()
      const active = document.activeElement
      realFocusOrder.push({
        tag: active?.tagName?.toLowerCase() || 'none',
        id: active?.getAttribute?.('id') || '',
        role: active?.getAttribute?.('role') || '',
        text: textOf(active).slice(0, 80),
      })
    }

    const contrastChecks = [...document.querySelectorAll('h1, h2, h3, p, a, button, label, input, textarea, select')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const text = textOf(element)
        return rect.width > 0 && rect.height > 0 && text.length > 0
      })
      .slice(0, 20)
      .map((element) => {
        const style = window.getComputedStyle(element)
        const fg = parseColor(style.color)
        const bg = nearestOpaqueBackground(element)
        const ratio = fg ? contrastRatio(fg, bg) : null
        return {
          tag: element.tagName.toLowerCase(),
          text: textOf(element).slice(0, 80),
          ratio,
        }
      })

    return {
      title: document.title,
      interactiveCount: interactive.length,
      missingNames,
      focusOrder,
      realFocusOrder,
      contrastChecks,
    }
  })

  await page.keyboard.press('Tab').catch(() => {})
  await page.keyboard.press('Tab').catch(() => {})
  const screenshotPath = path.join(browserDir, `${definition.name}.png`)
  const consolePath = path.join(consoleDir, `${definition.name}.txt`)
  const dataPath = path.join(dataDir, `${definition.name}.json`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await writeText(
    consolePath,
    [
      consoleMessages.length ? consoleMessages.join('\n') : 'No console output captured',
      '',
      pageErrors.length ? pageErrors.join('\n') : 'No page errors captured',
    ].join('\n'),
  )
  await writeJson(dataPath, analysis)

  const contrastFailures = analysis.contrastChecks.filter((item) => typeof item.ratio === 'number' && item.ratio < 4.5)

  return {
    page: definition.name,
    viewport: definition.viewport,
    colorScheme: definition.colorScheme,
    title: analysis.title,
    interactiveCount: analysis.interactiveCount,
    missingAccessibleNames: analysis.missingNames,
    focusOrder: analysis.realFocusOrder,
    contrastFailures,
    consoleErrors: consoleMessages.filter((item) => item.startsWith('error:')),
    pageErrors,
    evidencePaths: [rel(screenshotPath), rel(consolePath), rel(dataPath)],
  }
}

async function main() {
  await ensureDirs()
  const fixtures = await gatherFixtures()
  let redis = null
  let server = null
  let baseUrl = 'http://127.0.0.1:3000'

  try {
    const ready = await fetch(`${baseUrl}/api/health/ready`)
    if (!ready.ok) throw new Error(`Readiness returned ${ready.status}`)
  } catch {
    redis = await startRedis('final-a11y')
    server = await startServer({
      port: 3252,
      redisUrl: redis.redisUrl,
      logPrefix: 'final-a11y-server',
    })
    baseUrl = server.baseUrl
  }

  const browser = await chromium.launch({ headless: true })
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' })
  const teacherContext = await browser.newContext({ ...devices['iPad Pro 11'], colorScheme: 'dark' })
  const studentContext = await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'light' })

  try {
    await Promise.all([
      primeLocale(adminContext, 'en'),
      primeLocale(teacherContext, 'en'),
      primeLocale(studentContext, 'en'),
    ])

    const adminPage = await adminContext.newPage()
    const teacherPage = await teacherContext.newPage()
    const studentPage = await studentContext.newPage()

    await loginPage(adminPage, baseUrl, fixtures.admin.email, 'Admin@123', '/admin')
    await loginPage(teacherPage, baseUrl, fixtures.teacher.email, 'Teacher@123', '/teacher')
    await loginPage(studentPage, baseUrl, fixtures.student.email, 'Student@123', '/student')

    const pages = [
      {
        page: adminPage,
        name: 'admin-lms-desktop-light',
        url: `${baseUrl}/admin/lms`,
        viewport: 'desktop',
        colorScheme: 'light',
      },
      {
        page: teacherPage,
        name: 'teacher-lms-tablet-dark',
        url: `${baseUrl}/teacher/lms`,
        viewport: 'tablet',
        colorScheme: 'dark',
      },
      {
        page: studentPage,
        name: 'student-lms-mobile-light',
        url: `${baseUrl}${fixtures.courseId ? `/student/lms/${fixtures.courseId}` : '/student/lms'}`,
        viewport: 'mobile',
        colorScheme: 'light',
      },
    ]

    const results = []
    for (const definition of pages) {
      results.push(await inspectPage(definition.page, definition))
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      status: results.every((item) =>
        item.consoleErrors.length === 0 &&
        item.pageErrors.length === 0 &&
        item.missingAccessibleNames.length === 0 &&
        item.contrastFailures.length === 0 &&
        item.focusOrder.length >= 3,
      )
        ? 'PASS'
        : 'FAIL',
      pages: results,
    }

    await writeJson(summaryPath, summary)
    console.log(`[final-a11y] ${summary.status}`)
    if (summary.status !== 'PASS') {
      process.exit(1)
    }
  } finally {
    await browser.close().catch(() => {})
    await Promise.all([adminContext.close().catch(() => {}), teacherContext.close().catch(() => {}), studentContext.close().catch(() => {})])
    if (server) await stopServer(server).catch(() => {})
    if (redis) await stopRedis(redis).catch(() => {})
    await prisma.$disconnect().catch(() => {})
  }
}

main().catch(async (error) => {
  await ensureDirs()
  await writeText(path.join(consoleDir, 'accessibility-audit-error.txt'), String(error?.stack || error))
  try {
    await prisma.$disconnect()
  } catch {}
  console.error('[final-a11y] FAIL', error)
  process.exit(1)
})
