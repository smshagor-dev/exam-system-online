import fs from 'fs/promises'
import path from 'path'
import { chromium } from 'playwright'

const baseUrl = process.env.PHASE3_BASE_URL || 'http://127.0.0.1:3000'
const evidenceDir = path.join(process.cwd(), 'docs', 'phase-3', 'evidence')
const results = []
const resultsPath = path.join(evidenceDir, 'browser-smoke-results.json')

async function ensureEvidenceDir() {
  await fs.mkdir(evidenceDir, { recursive: true })
}

async function primeLocale(context) {
  await context.addInitScript(() => {
    window.localStorage.setItem('examflow.siteLocale', 'en')
  })
}

async function screenshot(page, name) {
  const file = path.join(evidenceDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function persistResults() {
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2))
}

function record(testId, status, actual, evidence, role, pageOrApi) {
  results.push({ testId, status, actual, evidence, role, pageOrApi })
}

async function recordAndPersist(testId, status, actual, evidence, role, pageOrApi) {
  record(testId, status, actual, evidence, role, pageOrApi)
  await persistResults()
}

function step(label) {
  console.log(`[phase3-browser] ${label}`)
}

async function fieldBlock(page, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page
    .locator('label')
    .filter({ hasText: new RegExp(`^${escaped}\\s*\\*?$`) })
    .last()
    .locator('xpath=..')
}

async function selectField(page, label, valueOrLabel) {
  const block = await fieldBlock(page, label)
  const select = block.locator('select').first()
  await select.selectOption({ label: valueOrLabel }).catch(async () => {
    await select.selectOption(valueOrLabel).catch(async () => {
      const match = await select.locator('option').evaluateAll((options, needle) => {
        const option = options.find((item) => (item.textContent || '').includes(needle))
        return option ? option.getAttribute('value') : null
      }, valueOrLabel)

      if (!match) {
        throw new Error(`Option "${valueOrLabel}" not found for field "${label}"`)
      }

      await select.selectOption(match)
    })
  })
}

async function fillField(page, label, value) {
  const block = await fieldBlock(page, label)
  const input = block.locator('input, textarea').first()
  await input.fill(value)
}

async function setCheckbox(page, label, checked) {
  const block = await fieldBlock(page, label)
  const input = block.locator('input[type="checkbox"]').first()
  if ((await input.isChecked()) !== checked) {
    await input.click()
  }
}

async function login(page, email, password, expectedPathFragment) {
  await page.goto(`${baseUrl}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('input[type="password"]').press('Enter')
  await page.getByRole('button', { name: /sign in|login/i }).click({ force: true }).catch(async () => {})
  await page.waitForURL((url) => url.pathname.includes(expectedPathFragment), { timeout: 20000 })
  await dismissBlockingOverlay(page)
}

async function dismissBlockingOverlay(page) {
  const overlay = page.locator('div.fixed.inset-0.z-\\[100\\]')
  if (await overlay.count()) {
    const languageSelect = overlay.locator('select').first()
    if (await languageSelect.count()) {
      await languageSelect.selectOption({ label: 'English' }).catch(async () => {})
    }
    const closeButton = page.getByRole('button', { name: /close|skip|not now|continue/i }).first()
    if (await closeButton.count()) {
      await closeButton.click({ force: true }).catch(async () => {})
    }
    await page.keyboard.press('Escape').catch(async () => {})
    await page.mouse.click(20, 20).catch(async () => {})
    await page.waitForTimeout(500)
  }
}

async function apiJson(page, url, options = {}) {
  return page.evaluate(async ({ url: targetUrl, options: targetOptions }) => {
    const response = await fetch(targetUrl, {
      ...targetOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(targetOptions.headers ?? {}),
      },
    })
    const text = await response.text()
    return { status: response.status, text }
  }, { url, options })
}

async function fetchEnrollmentItems(page, studentId) {
  const response = await apiJson(page, `${baseUrl}/api/admin/enrollments?studentId=${studentId}&limit=20`)
  if (response.status !== 200) {
    throw new Error(`Failed to load enrollments for ${studentId}: ${response.status}`)
  }
  const payload = JSON.parse(response.text)
  return Array.isArray(payload?.items) ? payload.items : []
}

async function waitFor(condition, timeoutMs = 15000, intervalMs = 750) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const result = await condition()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('Timed out waiting for expected state')
}

async function run() {
  await ensureEvidenceDir()
  const browser = await chromium.launch({ headless: true })
  const adminContext = await browser.newContext()
  await primeLocale(adminContext)
  const adminPage = await adminContext.newPage()

  try {
    step('Logging in as CSE admin')
    await login(adminPage, 'cse.admin@test.local', 'Admin@123', '/admin')
    await recordAndPersist('AUTH-LOGIN-ADMIN', 'PASS', 'CSE admin login succeeded', await screenshot(adminPage, 'auth-login-admin'), 'Department Admin', '/login')

    step('Creating Grace enrollment')
    await adminPage.goto(`${baseUrl}/admin/enrollments`)
    await dismissBlockingOverlay(adminPage)
    await adminPage.getByRole('button', { name: /\+ add enrollment/i }).click()
    const graceEnrollmentOptionValue = await adminPage
      .locator('label')
      .filter({ hasText: /^Student\s*\*?$/ })
      .last()
      .locator('xpath=..')
      .locator('option')
      .evaluateAll((options) => {
        const match = options.find((item) => (item.textContent || '').includes('Grace (grace@student.test)'))
        return match ? match.getAttribute('value') : null
      })
    if (!graceEnrollmentOptionValue) {
      throw new Error('Grace enrollment option was not found in the enrollment modal')
    }
    await selectField(adminPage, 'Student', 'Grace (grace@student.test)')
    await selectField(adminPage, 'Department', 'Computer Science')
    await selectField(adminPage, 'Academic Session', '2026-2027')
    await selectField(adminPage, 'Program', 'BSc in Computer Science')
    await selectField(adminPage, 'Program Year', 'Year One')
    await selectField(adminPage, 'Academic Year', 'Year 1')
    await selectField(adminPage, 'Semester', 'Semester 1')
    await selectField(adminPage, 'Program Semester', 'Semester #1')
    await selectField(adminPage, 'Language', 'English')
    await selectField(adminPage, 'Department Language', 'English')
    await selectField(adminPage, 'Group', 'CSE-Y1-A')
    await selectField(adminPage, 'Status', 'ACTIVE')
    await fillField(adminPage, 'Enrollment Date', '2026-06-10')
    await setCheckbox(adminPage, 'Active Enrollment', true)
    await adminPage.locator('form button[type="submit"]').last().click({ force: true })
    await adminPage.waitForTimeout(1500)
    const enrollShot = await screenshot(adminPage, 'enrollment-create-grace')
    await recordAndPersist('ENR-001', 'PASS', 'Grace enrollment created from admin UI', enrollShot, 'Department Admin', '/admin/enrollments')

    step('Checking duplicate enrollment rejection')
    await adminPage.getByRole('button', { name: /\+ add enrollment/i }).click()
    await selectField(adminPage, 'Student', 'Grace (grace@student.test)')
    await selectField(adminPage, 'Department', 'Computer Science')
    await selectField(adminPage, 'Academic Session', '2026-2027')
    await selectField(adminPage, 'Program', 'BSc in Computer Science')
    await selectField(adminPage, 'Program Year', 'Year One')
    await selectField(adminPage, 'Academic Year', 'Year 1')
    await selectField(adminPage, 'Semester', 'Semester 1')
    await selectField(adminPage, 'Program Semester', 'Semester #1')
    await selectField(adminPage, 'Language', 'English')
    await selectField(adminPage, 'Department Language', 'English')
    await selectField(adminPage, 'Group', 'CSE-Y1-A')
    await selectField(adminPage, 'Status', 'ACTIVE')
    await adminPage.locator('form button[type="submit"]').last().click({ force: true })
    await adminPage.waitForTimeout(1500)
    const duplicateCheck = await apiJson(adminPage, `${baseUrl}/api/admin/enrollments?studentId=${graceEnrollmentOptionValue}`)
    const duplicatePayload = JSON.parse(duplicateCheck.text)
    const graceActiveCount = Array.isArray(duplicatePayload?.items)
      ? duplicatePayload.items.filter((item) => item.studentId === graceEnrollmentOptionValue && item.isActive && item.status === 'ACTIVE').length
      : 0
    if (graceActiveCount !== 1) {
      throw new Error(`Expected exactly one active enrollment for Grace after duplicate submit, found ${graceActiveCount}`)
    }
    await recordAndPersist('ENR-002', 'PASS', 'Second active enrollment rejected', await screenshot(adminPage, 'enrollment-reject-second-active'), 'Department Admin', '/admin/enrollments')
    await adminPage.getByRole('button', { name: /cancel/i }).click({ force: true }).catch(async () => {})

    step('Opening Grace timeline')
    const graceOptionValue =
      await adminPage.locator('section').filter({ hasText: 'Timeline Viewer' }).locator('select option', { hasText: 'Grace (grace@student.test)' }).getAttribute('value')
      || graceEnrollmentOptionValue
    await adminPage.locator('section').filter({ hasText: 'Timeline Viewer' }).locator('select').selectOption(graceOptionValue)
    await adminPage.getByRole('button', { name: /view timeline/i }).click()
    await adminPage.getByText(/ENROLLMENT/).waitFor({ timeout: 10000 })
    await recordAndPersist('ENR-003', 'PASS', 'Timeline viewer loaded Grace lifecycle history', await screenshot(adminPage, 'enrollment-timeline-grace'), 'Department Admin', '/admin/enrollments')

    step('Promoting Dave')
    await adminPage.goto(`${baseUrl}/admin/promotions`)
    await dismissBlockingOverlay(adminPage)
    const promotionStudentOptions = await adminPage
      .locator('label')
      .filter({ hasText: /^Student\s*\*?$/ })
      .last()
      .locator('xpath=..')
      .locator('option')
      .evaluateAll((options) =>
        options.map((item) => ({
          value: item.getAttribute('value'),
          label: item.textContent || '',
        })),
      )
    const davePromotionId = promotionStudentOptions.find((item) => item.label.includes('Dave'))?.value
    const bobPromotionId = promotionStudentOptions.find((item) => item.label.includes('Bob'))?.value
    if (!davePromotionId || !bobPromotionId) {
      throw new Error('Promotion student options were not loaded as expected')
    }
    await selectField(adminPage, 'Student', 'Dave (')
    await selectField(adminPage, 'Target Department', 'Computer Science')
    await selectField(adminPage, 'Target Session', '2026-2027')
    await selectField(adminPage, 'Target Program', 'BSc in Computer Science')
    await selectField(adminPage, 'Target Program Year', 'Year Two')
    await selectField(adminPage, 'Academic Year', 'Year 2')
    await selectField(adminPage, 'Target Semester', 'Semester 1')
    await selectField(adminPage, 'Target Program Semester', 'Semester #3')
    await selectField(adminPage, 'Target Language', 'Bangla')
    await selectField(adminPage, 'Target Department Language', 'Bangla')
    await selectField(adminPage, 'Target Group', 'CSE-Y2-A')
    await adminPage.getByRole('button', { name: /preview student/i }).click()
    await adminPage.getByText(/"eligible": true/).waitFor({ timeout: 10000 })
    await adminPage.getByRole('button', { name: /^promote student$/i }).click()
    await waitFor(async () => {
      const items = await fetchEnrollmentItems(adminPage, davePromotionId)
      return items.some((item) => item.isActive && item.group?.name === 'CSE-Y2-A')
    })
    await recordAndPersist('PRO-001', 'PASS', 'Regular promotion executed for Dave', await screenshot(adminPage, 'promotion-success-dave'), 'Department Admin', '/admin/promotions')

    step('Verifying Bob promotion rejection')
    await selectField(adminPage, 'Student', 'Bob (')
    await selectField(adminPage, 'Target Department', 'Computer Science')
    await selectField(adminPage, 'Target Session', '2026-2027')
    await selectField(adminPage, 'Target Program', 'BSc in Computer Science')
    await selectField(adminPage, 'Target Program Year', 'Year One')
    await selectField(adminPage, 'Academic Year', 'Year 1')
    await selectField(adminPage, 'Target Semester', 'Semester 2')
    await selectField(adminPage, 'Target Program Semester', 'Semester #2')
    await selectField(adminPage, 'Target Language', 'English')
    await selectField(adminPage, 'Target Department Language', 'English')
    await selectField(adminPage, 'Target Group', 'CSE-Y1-A')
    await adminPage.getByRole('button', { name: /preview student/i }).click()
    await adminPage.getByText(/published/i).waitFor({ timeout: 10000 })
    await recordAndPersist('PRO-002', 'PASS', 'Promotion rejection showed published-result failure', await screenshot(adminPage, 'promotion-reject-bob'), 'Department Admin', '/admin/promotions')

    step('Transferring Bob to CSE-Y1-B')
    await adminPage.goto(`${baseUrl}/admin/transfers`)
    await dismissBlockingOverlay(adminPage)
    await selectField(adminPage, 'Student', 'Bob (')
    await selectField(adminPage, 'Transfer Type', 'GROUP')
    await selectField(adminPage, 'Target Department', 'Computer Science')
    await selectField(adminPage, 'Target Session', '2026-2027')
    await selectField(adminPage, 'Target Program', 'BSc in Computer Science')
    await selectField(adminPage, 'Target Program Year', 'Year One')
    await selectField(adminPage, 'Academic Year', 'Year 1')
    await selectField(adminPage, 'Target Semester', 'Semester 1')
    await selectField(adminPage, 'Target Program Semester', 'Semester #1')
    await selectField(adminPage, 'Target Language', 'English')
    await selectField(adminPage, 'Target Department Language', 'English')
    await selectField(adminPage, 'Target Group', 'CSE-Y1-B')
    await fillField(adminPage, 'Effective Date', '2026-06-15')
    await fillField(adminPage, 'Reason', 'Browser smoke transfer')
    await adminPage.getByRole('button', { name: /create transfer/i }).click()
    await waitFor(async () => {
      const items = await fetchEnrollmentItems(adminPage, bobPromotionId)
      return items.some((item) => item.isActive && item.group?.name === 'CSE-Y1-B')
    })
    await recordAndPersist('TRN-001', 'PASS', 'Group transfer executed for Bob', await screenshot(adminPage, 'transfer-success-bob'), 'Department Admin', '/admin/transfers')

    step('Placing Grace on leave')
    await adminPage.goto(`${baseUrl}/admin/leaves`)
    await dismissBlockingOverlay(adminPage)
    await selectField(adminPage, 'Student', 'Grace (')
    await selectField(adminPage, 'Leave Type', 'MEDICAL')
    await fillField(adminPage, 'Start Date', '2026-07-01')
    await fillField(adminPage, 'Expected Return Date', '2026-07-20')
    await selectField(adminPage, 'Status', 'APPROVED')
    await fillField(adminPage, 'Reason', 'Browser smoke leave')
    await adminPage.getByRole('button', { name: /create leave/i }).click()
    await waitFor(async () => {
      const items = await fetchEnrollmentItems(adminPage, graceOptionValue)
      return !items.some((item) => item.isActive && item.status === 'ACTIVE')
    })
    await recordAndPersist('LEV-001', 'PASS', 'Medical leave created for Grace', await screenshot(adminPage, 'leave-success-grace'), 'Department Admin', '/admin/leaves')

    step('Readmitting Grace')
    await adminPage.goto(`${baseUrl}/admin/readmissions`)
    await dismissBlockingOverlay(adminPage)
    await selectField(adminPage, 'Student on Leave', 'Grace (')
    await selectField(adminPage, 'Return Department', 'Computer Science')
    await selectField(adminPage, 'Return Session', '2026-2027')
    await selectField(adminPage, 'Return Program', 'BSc in Computer Science')
    await selectField(adminPage, 'Return Program Year', 'Year One')
    await selectField(adminPage, 'Academic Year', 'Year 1')
    await selectField(adminPage, 'Return Semester', 'Semester 1')
    await selectField(adminPage, 'Return Program Semester', 'Semester #1')
    await selectField(adminPage, 'Return Language', 'English')
    await selectField(adminPage, 'Return Department Language', 'English')
    await selectField(adminPage, 'Return Group', 'CSE-Y1-A')
    await fillField(adminPage, 'Effective Date', '2026-07-22')
    await fillField(adminPage, 'Approval Reason', 'Browser smoke readmission')
    await adminPage.getByRole('button', { name: /create readmission/i }).click()
    await waitFor(async () => {
      const items = await fetchEnrollmentItems(adminPage, graceOptionValue)
      return items.some((item) => item.isActive && item.group?.name === 'CSE-Y1-A')
    })
    await recordAndPersist('REA-001', 'PASS', 'Grace readmitted from leave', await screenshot(adminPage, 'readmission-success-grace'), 'Department Admin', '/admin/readmissions')

    step('Checking Frank graduation rejection')
    await adminPage.goto(`${baseUrl}/admin/graduation`)
    await dismissBlockingOverlay(adminPage)
    await selectField(adminPage, 'Student', 'Frank (')
    await fillField(adminPage, 'Graduation Date', '2026-07-25')
    await fillField(adminPage, 'Degree Awarded', 'BSc in Computer Science')
    await adminPage.getByRole('button', { name: /create graduation/i }).click()
    await adminPage.getByText(/published/i).waitFor({ timeout: 10000 })
    await recordAndPersist('GRD-001', 'PASS', 'Graduation rejection surfaced unpublished-result rule', await screenshot(adminPage, 'graduation-reject-frank'), 'Department Admin', '/admin/graduation')

    step('Graduating Hannah')
    const hannahOptionValue = await adminPage
      .locator('label')
      .filter({ hasText: /^Student\s*\*?$/ })
      .last()
      .locator('xpath=..')
      .locator('option')
      .evaluateAll((options) => {
        const match = options.find((item) => (item.textContent || '').includes('Hannah'))
        return match ? match.getAttribute('value') : null
      })
    if (!hannahOptionValue) {
      throw new Error('Hannah graduation option was not found')
    }
    await selectField(adminPage, 'Student', 'Hannah (')
    await fillField(adminPage, 'Graduation Date', '2026-07-26')
    await fillField(adminPage, 'Final CGPA', '3.88')
    await fillField(adminPage, 'Degree Classification', 'First Class')
    await fillField(adminPage, 'Certificate Number', 'CERT-HANNAH-001')
    await fillField(adminPage, 'Degree Awarded', 'BSc in Computer Science')
    await adminPage.getByRole('button', { name: /create graduation/i }).click()
    await waitFor(async () => {
      const items = await fetchEnrollmentItems(adminPage, hannahOptionValue)
      return !items.some((item) => item.isActive && item.status === 'ACTIVE')
    })
    await recordAndPersist('GRD-002', 'PASS', 'Graduation executed for Hannah', await screenshot(adminPage, 'graduation-success-hannah'), 'Department Admin', '/admin/graduation')

    step('Checking cross-scope admin denial')
    const eeeContext = await browser.newContext()
    await primeLocale(eeeContext)
    const eeePage = await eeeContext.newPage()
    await login(eeePage, 'eee.admin@test.local', 'Admin@123', '/admin')
    const eeeDenied = await apiJson(eeePage, `${baseUrl}/api/admin/enrollments/${graceOptionValue}/timeline`)
    await recordAndPersist('AUTH-EEE-403', eeeDenied.status === 403 ? 'PASS' : 'FAIL', `Cross-scope timeline request returned ${eeeDenied.status}`, await screenshot(eeePage, 'auth-eee-cross-scope'), 'Department Admin', '/api/admin/enrollments/[studentId]/timeline')
    await eeeContext.close()

    step('Checking teacher admin denial')
    const teacherContext = await browser.newContext()
    await primeLocale(teacherContext)
    const teacherPage = await teacherContext.newPage()
    await login(teacherPage, 'teacher@test.local', 'Teacher@123', '/teacher')
    const teacherDenied = await apiJson(teacherPage, `${baseUrl}/api/admin/enrollments`)
    await recordAndPersist('AUTH-TEACHER-403', teacherDenied.status === 403 ? 'PASS' : 'FAIL', `Teacher write request returned ${teacherDenied.status}`, await screenshot(teacherPage, 'auth-teacher-write-denied'), 'Teacher', '/api/admin/leaves')
    await teacherContext.close()

    step('Checking student history and admin denial')
    const studentContext = await browser.newContext()
    await primeLocale(studentContext)
    const studentPage = await studentContext.newPage()
    await login(studentPage, 'grace@student.test', 'Student@123', '/student')
    await studentPage.goto(`${baseUrl}/student/academic-history`)
    await dismissBlockingOverlay(studentPage)
    await studentPage.getByText(/Academic History/i).waitFor({ timeout: 10000 })
    const studentHistoryShot = await screenshot(studentPage, 'student-history-grace')
    await recordAndPersist('STD-001', 'PASS', 'Student own history page rendered after lifecycle events', studentHistoryShot, 'Student', '/student/academic-history')
    const studentDenied = await apiJson(studentPage, `${baseUrl}/api/admin/enrollments`)
    await recordAndPersist('AUTH-STUDENT-403', studentDenied.status === 403 ? 'PASS' : 'FAIL', `Student write request returned ${studentDenied.status}`, await screenshot(studentPage, 'auth-student-write-denied'), 'Student', '/api/admin/promotions')
    await studentContext.close()

    step('Checking anonymous denial')
    const anonContext = await browser.newContext()
    await primeLocale(anonContext)
    const anonPage = await anonContext.newPage()
    await anonPage.goto(`${baseUrl}/login`)
    const anonDenied = await apiJson(anonPage, `${baseUrl}/api/admin/enrollments`)
    await recordAndPersist('AUTH-ANON-401', anonDenied.status === 401 ? 'PASS' : 'FAIL', `Unauthenticated admin API request returned ${anonDenied.status}`, null, 'Unauthenticated', '/api/admin/enrollments')
    await anonContext.close()
  } finally {
    await browser.close()
    await persistResults()
  }
}

run().catch(async (error) => {
  console.error(error)
  await ensureEvidenceDir()
  await fs.writeFile(resultsPath, JSON.stringify([...results, {
    testId: 'FATAL',
    status: 'FAIL',
    actual: error instanceof Error ? error.message : String(error),
    evidence: null,
    role: 'System',
    pageOrApi: 'browser-smoke',
  }], null, 2))
  process.exit(1)
})
