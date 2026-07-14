import fs from 'fs/promises'
import path from 'path'
import { chromium, type BrowserContext, type Page } from 'playwright'
import {
  RELEASE_VERIFY_ADMIN_EMAIL,
  RELEASE_VERIFY_STUDENT_EMAIL,
  RELEASE_VERIFY_TEACHER_EMAIL,
  bootstrapReleaseVerificationBundle,
  cleanupReleaseVerificationBundle,
} from './bootstrap-release-verification'

type EvidenceBucket = {
  console: string[]
  network: Array<{ kind: string; url: string; status?: number; message?: string }>
}

const rootDir = process.cwd()
const evidenceRoot = path.join(rootDir, 'docs', 'production-release', 'evidence', 'clean-install')
const browserDir = path.join(evidenceRoot, 'browser')
const networkDir = path.join(evidenceRoot, 'network')
const consoleDir = path.join(evidenceRoot, 'console')
const databaseDir = path.join(evidenceRoot, 'database')
const SITE_LOCALE_STORAGE_KEY = 'examflow.siteLocale'
const SITE_LOCALE_COOKIE_NAME = 'site_locale'
const DEFAULT_LOCALE = 'en'

async function ensureDirs() {
  await Promise.all(
    [browserDir, networkDir, consoleDir, databaseDir].map((dir) =>
      fs.mkdir(dir, { recursive: true })
    )
  )
}

function rel(filePath: string) {
  return filePath.replace(`${rootDir}${path.sep}`, '').replaceAll('\\', '/')
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return rel(filePath)
}

async function writeText(filePath: string, value: string[]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${value.join('\n')}\n`, 'utf8')
  return rel(filePath)
}

function attachCollectors(page: Page, bucket: EvidenceBucket) {
  page.on('console', (message) => {
    bucket.console.push(`[${message.type()}] ${message.text()}`)
  })

  page.on('requestfailed', (request) => {
    bucket.network.push({
      kind: 'requestfailed',
      url: request.url(),
      message: request.failure()?.errorText ?? 'unknown',
    })
  })

  page.on('response', (response) => {
    if (response.status() >= 400) {
      bucket.network.push({
        kind: 'response',
        url: response.url(),
        status: response.status(),
      })
    }
  })
}

async function prepareContext(context: BrowserContext) {
  await context.addInitScript(
    ({ storageKey, cookieName, locale }) => {
      window.localStorage.setItem(storageKey, locale)
      document.cookie = `${cookieName}=${locale}; path=/; max-age=31536000; samesite=lax`
    },
    {
      storageKey: SITE_LOCALE_STORAGE_KEY,
      cookieName: SITE_LOCALE_COOKIE_NAME,
      locale: DEFAULT_LOCALE,
    }
  )
}

async function login(page: Page, baseUrl: string, email: string, password: string, expectedPath: string) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => url.pathname.startsWith(expectedPath), { timeout: 30000 })
}

async function logout(page: Page, email: string) {
  const signOutButton = page.getByRole('button', { name: /sign out/i })
  if (!(await signOutButton.isVisible().catch(() => false))) {
    const profileToggle = page.getByRole('button').filter({ hasText: email }).first()
    await profileToggle.click()
  }
  await signOutButton.click()
  await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 30000 })
}

async function collectPageEvidence(
  context: BrowserContext,
  filePrefix: string,
  baseUrl: string,
  email: string,
  password: string,
  landingPath: string,
  routeToLoad: string
) {
  const bucket: EvidenceBucket = { console: [], network: [] }
  const page = await context.newPage()
  attachCollectors(page, bucket)

  await login(page, baseUrl, email, password, landingPath)
  await page.goto(`${baseUrl}${routeToLoad}`, { waitUntil: 'networkidle' })
  const screenshotPath = path.join(browserDir, `${filePrefix}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const consolePath = await writeText(path.join(consoleDir, `${filePrefix}.txt`), bucket.console)
  const networkPath = await writeJson(path.join(networkDir, `${filePrefix}.json`), bucket.network)

  return {
    page,
    bucket,
    screenshotPath: rel(screenshotPath),
    consolePath,
    networkPath,
  }
}

async function startProductionServer(port: number, redisUrl: string) {
  const helpers = await import('../phase-6/evidence-helpers.mjs')
  return helpers.startServer({
    port,
    redisUrl,
    logPrefix: 'production-clean-install',
    nodeEnv: 'production',
    host: '127.0.0.1',
    extraEnv: {
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'release-clean-install-secret',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'release-clean-install-secret',
    },
  })
}

async function main() {
  await ensureDirs()

  const adminPassword = process.env.RELEASE_VERIFY_ADMIN_PASSWORD
  const teacherPassword = process.env.RELEASE_VERIFY_TEACHER_PASSWORD
  const studentPassword = process.env.RELEASE_VERIFY_STUDENT_PASSWORD

  if (!adminPassword || !teacherPassword || !studentPassword) {
    throw new Error(
      'Set RELEASE_VERIFY_ADMIN_PASSWORD, RELEASE_VERIFY_TEACHER_PASSWORD, and RELEASE_VERIFY_STUDENT_PASSWORD.'
    )
  }

  const helpers = await import('../phase-6/evidence-helpers.mjs')
  const redis = await helpers.startRedis('production-clean-install')
  const server = await startProductionServer(3320, redis.redisUrl)
  const browser = await chromium.launch({ headless: true })

  try {
    const bootstrap = await bootstrapReleaseVerificationBundle()
    await writeJson(path.join(databaseDir, 'bootstrap.json'), bootstrap)

    const health = await fetch(`${server.baseUrl}/api/health/ready`).then((response) => response.json())
    await writeJson(path.join(databaseDir, 'health.json'), health)

    const adminContext = await browser.newContext()
    const teacherContext = await browser.newContext()
    const studentContext = await browser.newContext()
    const anonContext = await browser.newContext()
    await Promise.all([
      prepareContext(adminContext),
      prepareContext(teacherContext),
      prepareContext(studentContext),
      prepareContext(anonContext),
    ])

    const adminEvidence = await collectPageEvidence(
      adminContext,
      'admin-dashboard',
      server.baseUrl,
      RELEASE_VERIFY_ADMIN_EMAIL,
      adminPassword,
      '/admin',
      '/admin/dashboard'
    )
    const teacherEvidence = await collectPageEvidence(
      teacherContext,
      'teacher-submissions',
      server.baseUrl,
      RELEASE_VERIFY_TEACHER_EMAIL,
      teacherPassword,
      '/teacher',
      '/teacher/coursework/submissions'
    )
    const studentEvidence = await collectPageEvidence(
      studentContext,
      'student-coursework',
      server.baseUrl,
      RELEASE_VERIFY_STUDENT_EMAIL,
      studentPassword,
      '/student',
      '/student/coursework'
    )

    await adminEvidence.page.goto(`${server.baseUrl}/admin/departments`, { waitUntil: 'networkidle' })
    await adminEvidence.page.screenshot({ path: path.join(browserDir, 'admin-protected-route.png'), fullPage: true })

    await teacherEvidence.page.goto(`${server.baseUrl}/teacher/coursework`, { waitUntil: 'networkidle' })
    await teacherEvidence.page.screenshot({ path: path.join(browserDir, 'teacher-coursework-overview.png'), fullPage: true })

    await studentEvidence.page.goto(`${server.baseUrl}/student/dashboard`, { waitUntil: 'networkidle' })
    await studentEvidence.page.screenshot({ path: path.join(browserDir, 'student-dashboard.png'), fullPage: true })

    await logout(adminEvidence.page, RELEASE_VERIFY_ADMIN_EMAIL)

    const anonPage = await anonContext.newPage()
    const anonBucket: EvidenceBucket = { console: [], network: [] }
    attachCollectors(anonPage, anonBucket)
    await anonPage.goto(`${server.baseUrl}/admin/dashboard`, { waitUntil: 'networkidle' })
    const deniedScreenshot = path.join(browserDir, 'unauth-admin-denied.png')
    await anonPage.screenshot({ path: deniedScreenshot, fullPage: true })
    const deniedToLogin = anonPage.url().includes('/login')

    const allConsole = [
      ...adminEvidence.bucket.console,
      ...teacherEvidence.bucket.console,
      ...studentEvidence.bucket.console,
      ...anonBucket.console,
    ]
    const allNetwork = [
      ...adminEvidence.bucket.network,
      ...teacherEvidence.bucket.network,
      ...studentEvidence.bucket.network,
      ...anonBucket.network,
    ]

    const criticalConsole = allConsole.filter(
      (line) =>
        line.includes('[error]') ||
        /hydration/i.test(line)
    )
    const unexpectedNetwork = allNetwork.filter(
      (entry) =>
        entry.message !== 'net::ERR_ABORTED' &&
        !entry.url.includes('/api/auth/session') &&
        !entry.url.includes('/api/auth/csrf')
    )

    const summary = {
      status:
        health?.ready &&
        deniedToLogin &&
        criticalConsole.length === 0 &&
        unexpectedNetwork.length === 0
          ? 'PASS'
          : 'FAIL',
      baseUrl: server.baseUrl,
      users: {
        admin: RELEASE_VERIFY_ADMIN_EMAIL,
        teacher: RELEASE_VERIFY_TEACHER_EMAIL,
        student: RELEASE_VERIFY_STUDENT_EMAIL,
      },
      evidence: {
        adminDashboard: adminEvidence.screenshotPath,
        teacherSubmissions: teacherEvidence.screenshotPath,
        studentCoursework: studentEvidence.screenshotPath,
        unauthDenied: rel(deniedScreenshot),
      },
      criticalConsole,
      unexpectedNetwork,
      deniedToLogin,
    }

    await writeJson(path.join(databaseDir, 'clean-install-summary.json'), summary)
    if (summary.status !== 'PASS') {
      throw new Error('Clean-install verification detected browser/runtime issues.')
    }
  } finally {
    const cleanup = await cleanupReleaseVerificationBundle()
    await writeJson(path.join(databaseDir, 'cleanup.json'), cleanup)
    await browser.close().catch(() => {})
    await helpers.stopServer(server).catch(() => {})
    await helpers.stopRedis(redis).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
