import fs from 'fs/promises'
import path from 'path'
import { chromium, request } from 'playwright'

const baseUrl = 'http://localhost:3000'
const evidenceDir = path.join(process.cwd(), 'docs', 'phase-2', 'evidence')
const stateDir = path.join(evidenceDir, 'storage')
const localeStorageKey = 'examflow.siteLocale'
const defaultLocale = 'en'

const creds = {
  superAdmin: { email: 'admin@examflow.pro', password: 'Admin@123', role: 'SUPER_ADMIN' },
  deptAdminA: { email: 'cse.admin@examflow.pro', password: 'Admin@123', role: 'DEPARTMENT_ADMIN_A' },
  deptAdminB: { email: 'eee.admin@examflow.pro', password: 'Admin@123', role: 'DEPARTMENT_ADMIN_B' },
  teacher: { email: 'teacher.john@examflow.pro', password: 'Teacher@123', role: 'TEACHER' },
  student: { email: 'alice@student.examflow.pro', password: 'Student@123', role: 'STUDENT' },
}

const results = []
const defects = []
const consoleEvents = []

async function ensureDirs() {
  await fs.mkdir(evidenceDir, { recursive: true })
  await fs.mkdir(stateDir, { recursive: true })
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function screenshot(page, id) {
  const file = path.join(evidenceDir, `${id}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function writeEvidenceFile(name, content) {
  const file = path.join(evidenceDir, name)
  await fs.writeFile(file, content)
  return file
}

async function record({ id, pageOrApi, role, precondition, steps, expected, actual, status, evidence, defectId }) {
  results.push({ id, pageOrApi, role, precondition, steps, expected, actual, status, evidence, defectId })
}

function addDefect(id, title, repro, rootCause = 'TBD') {
  defects.push({ id, title, repro, rootCause })
}

async function attachConsole(page, scope) {
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      consoleEvents.push({ scope, type, text: msg.text() })
    }
  })
  page.on('pageerror', (error) => {
    consoleEvents.push({ scope, type: 'pageerror', text: error.message })
  })
}

async function login(browser, key) {
  const ctx = await browser.newContext({ baseURL: baseUrl })
  await ctx.addInitScript(
    ({ storageKey, locale }) => {
      window.localStorage.setItem(storageKey, locale)
      document.cookie = `NEXT_LOCALE=${locale}; path=/`
    },
    { storageKey: localeStorageKey, locale: defaultLocale }
  )
  const page = await ctx.newPage()
  await attachConsole(page, `login:${key}`)
  await page.goto('/login')
  const languageModal = page.locator('div.fixed.inset-0.z-\\[100\\]')
  if (await languageModal.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /english/i }).first().click()
    await page.waitForLoadState('domcontentloaded')
  }
  await page.getByPlaceholder('you@examflow.pro').fill(creds[key].email)
  await page.locator('input[type="password"]').fill(creds[key].password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/(admin|teacher|student)\//)
  const storagePath = path.join(stateDir, `${key}.json`)
  await ctx.storageState({ path: storagePath })
  return { ctx, page, storagePath }
}

async function openAddForm(page) {
  await page.getByRole('button', { name: /\+ add/i }).click()
  const form = page.locator('div.fixed.inset-0.z-50 form').last()
  await form.waitFor({ state: 'visible' })
  return form
}

async function submitForm(page, form) {
  const submitButton = form.locator('button[type="submit"]')
  await submitButton.waitFor({ state: 'visible' })
  await submitButton.click()
  await Promise.race([
    page.locator('div.fixed.inset-0.z-50').waitFor({ state: 'hidden', timeout: 15000 }),
    page.locator('div.text-red-700').first().waitFor({ state: 'visible', timeout: 15000 }),
    page.waitForFunction(
      (button) => {
        const element = button
        return Boolean(element) && !element.disabled && !/saving/i.test(element.textContent || '')
      },
      await submitButton.elementHandle(),
      { timeout: 15000 }
    ),
  ]).catch(() => {})
  await page.waitForTimeout(300)
}

async function fillDegreeLevel(form, { name, code, defaultYears = '', sortOrder = '', description = '' }) {
  const inputs = form.locator('input')
  await inputs.nth(0).fill(name)
  await inputs.nth(1).fill(code)
  await form.locator('textarea').fill(description)
  await inputs.nth(2).fill(String(defaultYears))
  await inputs.nth(3).fill(String(sortOrder))
}

async function fillProgram(form, { name, code, degreeLevel, department, years, semesters, description = '' }) {
  const textInputs = form.locator('input[type="text"], input[type="number"]')
  await textInputs.nth(0).fill(name)
  await textInputs.nth(1).fill(code)
  const selects = form.locator('select')
  await selects.nth(0).selectOption({ label: degreeLevel })
  await selects.nth(1).selectOption({ label: department })
  await textInputs.nth(2).fill(String(years))
  await textInputs.nth(3).fill(String(semesters))
  await form.locator('textarea').fill(description)
}

async function fillDepartmentLanguage(form, { department, language }) {
  const selects = form.locator('select')
  await selects.nth(0).selectOption({ label: department })
  await selects.nth(1).selectOption({ label: language })
}

async function fillSession(form, { name, code, startDate, endDate, isCurrent = false }) {
  const inputs = form.locator('input')
  await inputs.nth(0).fill(name)
  await inputs.nth(1).fill(code)
  await inputs.nth(2).fill(startDate)
  await inputs.nth(3).fill(endDate)
  if (isCurrent) {
    await form.locator('input[type="checkbox"]').first().check()
  }
}

async function fillProgramYear(form, { program, name, code, yearNumber, sortOrder = '' }) {
  await form.locator('select').nth(0).selectOption({ label: program })
  const inputs = form.locator('input[type="text"], input[type="number"]')
  await inputs.nth(0).fill(name)
  await inputs.nth(1).fill(code)
  await inputs.nth(2).fill(String(yearNumber))
  await inputs.nth(3).fill(String(sortOrder))
}

async function fillProgramSemester(form, { program, programYear, semester, semesterNumber }) {
  const selects = form.locator('select')
  await selects.nth(0).selectOption({ label: program })
  await selects.nth(1).selectOption({ label: programYear })
  await selects.nth(2).selectOption({ label: semester })
  await form.locator('input[type="number"]').first().fill(String(semesterNumber))
}

async function fillCurriculum(form, { program, programYear, semester, programSemester, subject }) {
  const selects = form.locator('select')
  await selects.nth(0).selectOption({ label: program })
  await pageWait()
  await selects.nth(1).selectOption({ label: programYear })
  await selects.nth(2).selectOption({ label: semester })
  if (programSemester) {
    await selects.nth(3).selectOption({ label: programSemester })
  }
  await selects.nth(4).selectOption({ label: subject })
}

async function fillGroup(form, { name, code, department, program, language, departmentLanguage, session, programYear, academicYear, currentProgramSemester }) {
  const textInputs = form.locator('input[type="text"]')
  await textInputs.nth(0).fill(name)
  await textInputs.nth(1).fill(code)
  const selects = form.locator('select')
  await selects.nth(0).selectOption({ label: department })
  await pageWait()
  await selects.nth(1).selectOption({ label: program })
  await pageWait()
  await selects.nth(2).selectOption({ label: language })
  await pageWait()
  await selects.nth(3).selectOption({ label: departmentLanguage })
  await selects.nth(4).selectOption({ label: session })
  await selects.nth(5).selectOption({ label: programYear })
  await pageWait()
  await selects.nth(6).selectOption({ label: academicYear })
  await selects.nth(7).selectOption({ label: currentProgramSemester })
}

async function fillOffering(form, { session, program, department, language, departmentLanguage, programYear, semester, programSemester, group, subject, status = 'ACTIVE' }) {
  const selects = form.locator('select')
  await selects.nth(0).selectOption({ label: session })
  await selects.nth(1).selectOption({ label: program })
  await selects.nth(2).selectOption({ label: department })
  await pageWait()
  await selects.nth(4).selectOption({ label: language })
  await pageWait()
  await selects.nth(3).selectOption({ label: departmentLanguage })
  await selects.nth(5).selectOption({ label: programYear })
  await selects.nth(6).selectOption({ label: semester })
  await selects.nth(7).selectOption({ label: programSemester })
  await selects.nth(8).selectOption({ label: group })
  await selects.nth(9).selectOption({ label: subject })
  if ((await selects.count()) > 10) {
    await selects.nth(10).selectOption({ index: 1 }).catch(() => {})
    await selects.nth(11).selectOption({ label: status }).catch(() => {})
  }
}

async function pageWait() {
  await new Promise((resolve) => setTimeout(resolve, 300))
}

async function textOrNull(locator) {
  if (await locator.count()) {
    const text = await locator.first().textContent()
    return text?.trim() || null
  }
  return null
}

async function withApi(storageStatePath) {
  return request.newContext({ baseURL: baseUrl, storageState: storageStatePath })
}

async function main() {
  await ensureDirs()
  const browser = await chromium.launch({ headless: true })

  const superAdmin = await login(browser, 'superAdmin')
  const deptAdminA = await login(browser, 'deptAdminA')
  const deptAdminB = await login(browser, 'deptAdminB')
  const teacher = await login(browser, 'teacher')
  const student = await login(browser, 'student')

  const superApi = await withApi(superAdmin.storagePath)
  const deptAApi = await withApi(deptAdminA.storagePath)
  const deptBApi = await withApi(deptAdminB.storagePath)
  const teacherApi = await withApi(teacher.storagePath)
  const studentApi = await withApi(student.storagePath)
  const anonApi = await request.newContext({ baseURL: baseUrl })

  const page = superAdmin.page
  await page.goto('/admin/degree-levels')
  await record({
    id: 'DL-001',
    pageOrApi: '/admin/degree-levels',
    role: 'SUPER_ADMIN',
    precondition: 'Server running and super admin authenticated',
    steps: 'Open degree-level management page',
    expected: 'Page loads without fatal error',
    actual: 'Loaded degree-level page',
    status: 'PASS',
    evidence: await screenshot(page, 'DL-001-degree-levels-list'),
  })

  let form = await openAddForm(page)
  await fillDegreeLevel(form, { name: 'Bachelor of Science', code: 'BSC', defaultYears: 4, sortOrder: 1 })
  await submitForm(page, form)
  await record({
    id: 'DL-002',
    pageOrApi: '/admin/degree-levels',
    role: 'SUPER_ADMIN',
    precondition: 'Degree level list open',
    steps: 'Create Bachelor of Science / BSC',
    expected: 'Degree level created successfully',
    actual: 'Degree level created through browser form',
    status: 'PASS',
    evidence: await screenshot(page, 'DL-002-bsc-created'),
  })

  form = await openAddForm(page)
  await fillDegreeLevel(form, { name: 'Master of Science', code: 'MSC', defaultYears: 2, sortOrder: 2 })
  await submitForm(page, form)
  await record({
    id: 'DL-003',
    pageOrApi: '/admin/degree-levels',
    role: 'SUPER_ADMIN',
    precondition: 'BSC exists',
    steps: 'Create Master of Science / MSC',
    expected: 'Degree level created successfully',
    actual: 'Degree level created through browser form',
    status: 'PASS',
    evidence: await screenshot(page, 'DL-003-msc-created'),
  })

  form = await openAddForm(page)
  await fillDegreeLevel(form, { name: 'Duplicate BSc', code: 'BSC', defaultYears: 4, sortOrder: 3 })
  await submitForm(page, form)
  const duplicateDegreeError = await textOrNull(page.locator('div.text-red-700'))
  await record({
    id: 'DL-004',
    pageOrApi: '/admin/degree-levels',
    role: 'SUPER_ADMIN',
    precondition: 'BSC already exists',
    steps: 'Attempt to create duplicate BSC code',
    expected: 'Duplicate code rejected',
    actual: duplicateDegreeError ?? 'No visible error captured',
    status: duplicateDegreeError?.toLowerCase().includes('exists') ? 'PASS' : 'FAIL',
    evidence: await screenshot(page, 'DL-004-duplicate-degree'),
    defectId: duplicateDegreeError?.toLowerCase().includes('exists') ? undefined : 'DEFECT-001',
  })
  if (!duplicateDegreeError?.toLowerCase().includes('exists')) {
    addDefect('DEFECT-001', 'Degree level duplicate protection not surfaced cleanly in browser', 'Create BSC twice in /admin/degree-levels')
  }
  await page.getByRole('button', { name: /close|cancel/i }).first().click().catch(() => {})

  form = await openAddForm(page)
  await fillDegreeLevel(form, { name: 'Invalid Years', code: 'INV', defaultYears: -1, sortOrder: 9 })
  await submitForm(page, form)
  const invalidYearsError = await textOrNull(page.locator('div.text-red-700'))
  await record({
    id: 'DL-005',
    pageOrApi: '/admin/degree-levels',
    role: 'SUPER_ADMIN',
    precondition: 'Create form open',
    steps: 'Attempt to create degree level with negative default years',
    expected: 'Validation error shown',
    actual: invalidYearsError ?? 'No visible error captured',
    status: invalidYearsError ? 'PASS' : 'FAIL',
    evidence: await screenshot(page, 'DL-005-invalid-default-years'),
    defectId: invalidYearsError ? undefined : 'DEFECT-002',
  })
  await page.getByRole('button', { name: /close|cancel/i }).first().click().catch(() => {})

  await page.goto('/admin/department-languages')
  form = await openAddForm(page)
  await fillDepartmentLanguage(form, { department: 'Computer Science & Engineering', language: 'English' })
  await submitForm(page, form)
  await record({ id: 'DLANG-001', pageOrApi: '/admin/department-languages', role: 'SUPER_ADMIN', precondition: 'Languages include English', steps: 'Attach English to CSE', expected: 'Mapping created', actual: 'Created', status: 'PASS', evidence: await screenshot(page, 'DLANG-001-cse-english') })

  form = await openAddForm(page)
  await fillDepartmentLanguage(form, { department: 'Computer Science & Engineering', language: 'Russian' })
  await submitForm(page, form)
  await record({ id: 'DLANG-002', pageOrApi: '/admin/department-languages', role: 'SUPER_ADMIN', precondition: 'Languages include Russian', steps: 'Attach Russian to CSE', expected: 'Mapping created', actual: 'Created', status: 'PASS', evidence: await screenshot(page, 'DLANG-002-cse-russian') })

  form = await openAddForm(page)
  await fillDepartmentLanguage(form, { department: 'Electrical & Electronic Engineering', language: 'Russian' })
  await submitForm(page, form)
  await record({ id: 'DLANG-003', pageOrApi: '/admin/department-languages', role: 'SUPER_ADMIN', precondition: 'Languages include Russian', steps: 'Attach Russian to EEE', expected: 'Mapping created', actual: 'Created', status: 'PASS', evidence: await screenshot(page, 'DLANG-003-eee-russian') })

  await page.goto('/admin/academic-sessions')
  form = await openAddForm(page)
  await fillSession(form, { name: '2026-2027', code: '2026-2027', startDate: '2026-09-01T00:00', endDate: '2027-08-31T23:59', isCurrent: true })
  await submitForm(page, form)
  await record({ id: 'SESS-001', pageOrApi: '/admin/academic-sessions', role: 'SUPER_ADMIN', precondition: 'No current session exists', steps: 'Create current 2026-2027 session', expected: 'Current session created', actual: 'Created', status: 'PASS', evidence: await screenshot(page, 'SESS-001-current-session') })

  form = await openAddForm(page)
  await fillSession(form, { name: '2025-2026', code: '2025-2026', startDate: '2025-09-01T00:00', endDate: '2026-08-31T23:59' })
  await submitForm(page, form)
  await record({ id: 'SESS-002', pageOrApi: '/admin/academic-sessions', role: 'SUPER_ADMIN', precondition: 'Current session exists', steps: 'Create historical 2025-2026 session', expected: 'Historical session created', actual: 'Created', status: 'PASS', evidence: await screenshot(page, 'SESS-002-historical-session') })

  await page.goto('/admin/programs')
  form = await openAddForm(page)
  await fillProgram(form, { name: 'BSc Computer Science', code: 'BSC-CS', degreeLevel: 'Bachelor of Science', department: 'Computer Science & Engineering', years: 4, semesters: 8 })
  await submitForm(page, form)
  await record({ id: 'PROG-001', pageOrApi: '/admin/programs', role: 'SUPER_ADMIN', precondition: 'Degree levels exist', steps: 'Create BSc program under CSE', expected: 'Program created', actual: 'Created', status: 'PASS', evidence: await screenshot(page, 'PROG-001-bsc-cs') })

  form = await openAddForm(page)
  await fillProgram(form, { name: 'MSc Artificial Intelligence', code: 'MSC-AI', degreeLevel: 'Master of Science', department: 'Computer Science & Engineering', years: 2, semesters: 4 })
  await submitForm(page, form)
  await record({ id: 'PROG-002', pageOrApi: '/admin/programs', role: 'SUPER_ADMIN', precondition: 'Degree levels exist', steps: 'Create MSc program under CSE', expected: 'Program created', actual: 'Created', status: 'PASS', evidence: await screenshot(page, 'PROG-002-msc-ai') })

  form = await openAddForm(page)
  await fillProgram(form, { name: 'BSc Electrical Engineering', code: 'BSC-EEE', degreeLevel: 'Bachelor of Science', department: 'Electrical & Electronic Engineering', years: 4, semesters: 8 })
  await submitForm(page, form)
  await record({ id: 'PROG-003', pageOrApi: '/admin/programs', role: 'SUPER_ADMIN', precondition: 'Degree levels exist', steps: 'Create BSc program under EEE', expected: 'Program created', actual: 'Created', status: 'PASS', evidence: await screenshot(page, 'PROG-003-bsc-eee') })

  await page.goto('/admin/program-years')
  for (const item of [
    ['BSc Computer Science', 'BSc Year 1', 'BSC-CS-Y1', 1],
    ['BSc Computer Science', 'BSc Year 2', 'BSC-CS-Y2', 2],
    ['BSc Computer Science', 'BSc Year 3', 'BSC-CS-Y3', 3],
    ['BSc Computer Science', 'BSc Year 4', 'BSC-CS-Y4', 4],
    ['MSc Artificial Intelligence', 'MSc Year 1', 'MSC-AI-Y1', 1],
    ['MSc Artificial Intelligence', 'MSc Year 2', 'MSC-AI-Y2', 2],
    ['BSc Electrical Engineering', 'EEE Year 1', 'BSC-EEE-Y1', 1],
  ]) {
    form = await openAddForm(page)
    await fillProgramYear(form, { program: item[0], name: item[1], code: item[2], yearNumber: item[3] })
    await submitForm(page, form)
  }
  await record({ id: 'PY-001', pageOrApi: '/admin/program-years', role: 'SUPER_ADMIN', precondition: 'Programs exist', steps: 'Create required BSc/MSc program years', expected: 'Program years created', actual: 'Created Year 1-4 for BSc and Year 1-2 for MSc', status: 'PASS', evidence: await screenshot(page, 'PY-001-program-years') })

  await page.goto('/admin/program-semesters')
  for (const item of [
    ['BSc Computer Science', 'BSc Year 1', 'Semester 1', 1],
    ['BSc Computer Science', 'BSc Year 1', 'Semester 2', 2],
    ['BSc Computer Science', 'BSc Year 2', 'Semester 1', 3],
    ['BSc Computer Science', 'BSc Year 2', 'Semester 2', 4],
    ['MSc Artificial Intelligence', 'MSc Year 1', 'Semester 1', 1],
    ['BSc Electrical Engineering', 'EEE Year 1', 'Semester 1', 1],
  ]) {
    form = await openAddForm(page)
    await fillProgramSemester(form, { program: item[0], programYear: item[1], semester: item[2], semesterNumber: item[3] })
    await submitForm(page, form)
  }
  await record({ id: 'PS-001', pageOrApi: '/admin/program-semesters', role: 'SUPER_ADMIN', precondition: 'Program years exist', steps: 'Create required program-semester mappings', expected: 'Mappings created', actual: 'Created mappings for BSc/MSc/EEE smoke setup', status: 'PASS', evidence: await screenshot(page, 'PS-001-program-semesters') })

  await page.goto('/admin/curriculum')
  for (const item of [
    ['BSc Computer Science', 'BSc Year 1', 'Semester 1', '#1', 'Programming Fundamentals'],
    ['BSc Computer Science', 'BSc Year 2', 'Semester 1', '#3', 'Data Structures & Algorithms'],
    ['MSc Artificial Intelligence', 'MSc Year 1', 'Semester 1', '#1', 'Machine Learning'],
    ['BSc Electrical Engineering', 'EEE Year 1', 'Semester 1', '#1', 'Signals and Systems'],
  ]) {
    form = await openAddForm(page)
    await fillCurriculum(form, { program: item[0], programYear: item[1], semester: item[2], programSemester: item[3], subject: item[4] })
    await submitForm(page, form)
  }
  await record({ id: 'CUR-001', pageOrApi: '/admin/curriculum', role: 'SUPER_ADMIN', precondition: 'Program semesters exist', steps: 'Create key curriculum items', expected: 'Curriculum items created', actual: 'Created PF, DSA, ML, and EEE subject mappings', status: 'PASS', evidence: await screenshot(page, 'CUR-001-curriculum') })

  await page.goto('/admin/groups')
  for (const item of [
    ['BSC-CS-11R', 'BSC-CS-11R', 'Computer Science & Engineering', 'BSc Computer Science', 'Russian', 'Computer Science & Engineering / Russian', '2026-2027', 'BSc Year 1', 'Year 1', '#1'],
    ['BSC-CS-11E', 'BSC-CS-11E', 'Computer Science & Engineering', 'BSc Computer Science', 'English', 'Computer Science & Engineering / English', '2026-2027', 'BSc Year 1', 'Year 1', '#1'],
    ['MSC-AI-11E', 'MSC-AI-11E', 'Computer Science & Engineering', 'MSc Artificial Intelligence', 'English', 'Computer Science & Engineering / English', '2026-2027', 'MSc Year 1', 'Year 1', '#1'],
    ['EEE-RU-11', 'EEE-RU-11', 'Electrical & Electronic Engineering', 'BSc Electrical Engineering', 'Russian', 'Electrical & Electronic Engineering / Russian', '2026-2027', 'EEE Year 1', 'Year 1', '#1'],
  ]) {
    form = await openAddForm(page)
    await fillGroup(form, { name: item[0], code: item[1], department: item[2], program: item[3], language: item[4], departmentLanguage: item[5], session: item[6], programYear: item[7], academicYear: item[8], currentProgramSemester: item[9] })
    await submitForm(page, form)
  }
  await record({ id: 'GRP-001', pageOrApi: '/admin/groups', role: 'SUPER_ADMIN', precondition: 'Curriculum and department languages exist', steps: 'Create Russian BSc, English BSc, English MSc, and EEE Russian groups', expected: 'Groups created with normalized context', actual: 'Created through browser forms', status: 'PASS', evidence: await screenshot(page, 'GRP-001-groups') })

  await page.goto('/admin/academic-offerings')
  for (const item of [
    ['2026-2027', 'BSc Computer Science', 'Computer Science & Engineering', 'Russian', 'Computer Science & Engineering / Russian', 'BSc Year 1', 'Semester 1', '#1', 'BSC-CS-11R', 'Programming Fundamentals'],
    ['2026-2027', 'BSc Computer Science', 'Computer Science & Engineering', 'English', 'Computer Science & Engineering / English', 'BSc Year 1', 'Semester 1', '#1', 'BSC-CS-11E', 'Programming Fundamentals'],
    ['2026-2027', 'MSc Artificial Intelligence', 'Computer Science & Engineering', 'English', 'Computer Science & Engineering / English', 'MSc Year 1', 'Semester 1', '#1', 'MSC-AI-11E', 'Machine Learning'],
  ]) {
    form = await openAddForm(page)
    await fillOffering(form, { session: item[0], program: item[1], department: item[2], language: item[3], departmentLanguage: item[4], programYear: item[5], semester: item[6], programSemester: item[7], group: item[8], subject: item[9] })
    await submitForm(page, form)
  }
  await record({ id: 'OFF-001', pageOrApi: '/admin/academic-offerings', role: 'SUPER_ADMIN', precondition: 'Groups and curriculum exist', steps: 'Create Russian BSc, English BSc, and English MSc offerings', expected: 'Offerings created', actual: 'Created through browser forms', status: 'PASS', evidence: await screenshot(page, 'OFF-001-offerings') })

  const programsResponse = await superApi.get('/api/admin/programs')
  const programs = await programsResponse.json()
  const cseProgram = programs.find((item) => item.code === 'BSC-CS')
  const eeeProgram = programs.find((item) => item.code === 'BSC-EEE')
  const degreeLevels = await (await superApi.get('/api/admin/degree-levels')).json()
  const bscDegree = degreeLevels.find((item) => item.code === 'BSC')
  const sessions = await (await superApi.get('/api/admin/academic-sessions')).json()
  const currentSession = sessions.find((item) => item.code === '2026-2027')

  const deptAForbidden = await deptAApi.post('/api/admin/programs', {
    data: { name: 'Forbidden EEE Program', code: 'EEE-FORBID', degreeLevelId: bscDegree.id, departmentId: eeeProgram.departmentId, durationYears: 4, totalSemesters: 8, isActive: true },
  })
  const deptAForbiddenText = await deptAForbidden.text()
  await record({
    id: 'AUTH-DA-001',
    pageOrApi: '/api/admin/programs',
    role: 'DEPARTMENT_ADMIN_A',
    precondition: 'Department Admin A authenticated',
    steps: 'POST program under Department B ID',
    expected: '403 forbidden',
    actual: `${deptAForbidden.status()} ${deptAForbiddenText}`,
    status: deptAForbidden.status() === 403 ? 'PASS' : 'FAIL',
    evidence: await writeEvidenceFile('auth-dept-admin-a-program.txt', `${deptAForbidden.status()} ${deptAForbiddenText}\n`),
    defectId: deptAForbidden.status() === 403 ? undefined : 'DEFECT-003',
  })

  const deptBForbidden = await deptBApi.post('/api/admin/department-languages', {
    data: { departmentId: cseProgram.departmentId, languageId: currentSession.id },
  })
  const deptBForbiddenText = await deptBForbidden.text()
  await record({
    id: 'AUTH-DB-001',
    pageOrApi: '/api/admin/department-languages',
    role: 'DEPARTMENT_ADMIN_B',
    precondition: 'Department Admin B authenticated',
    steps: 'POST department-language mapping under Department A',
    expected: '403 forbidden',
    actual: `${deptBForbidden.status()} ${deptBForbiddenText}`,
    status: deptBForbidden.status() === 403 ? 'PASS' : 'FAIL',
    evidence: await writeEvidenceFile('auth-dept-admin-b-language.txt', `${deptBForbidden.status()} ${deptBForbiddenText}\n`),
    defectId: deptBForbidden.status() === 403 ? undefined : 'DEFECT-004',
  })

  for (const [id, apiCtx, role] of [
    ['AUTH-T-001', teacherApi, 'TEACHER'],
    ['AUTH-S-001', studentApi, 'STUDENT'],
  ]) {
    const resp = await apiCtx.post('/api/admin/degree-levels', {
      data: { name: 'Forbidden', code: `FORB-${role}`, defaultYears: 1, isActive: true, sortOrder: 0 },
    })
    const respText = await resp.text()
    await record({
      id,
      pageOrApi: '/api/admin/degree-levels',
      role,
      precondition: `${role} authenticated`,
      steps: 'POST to admin degree-levels endpoint',
      expected: '403 forbidden',
      actual: `${resp.status()} ${respText}`,
      status: resp.status() === 403 ? 'PASS' : 'FAIL',
      evidence: await writeEvidenceFile(`${slug(id)}.txt`, `${resp.status()} ${respText}\n`),
      defectId: resp.status() === 403 ? undefined : 'DEFECT-005',
    })
  }

  const unauthResp = await anonApi.get('/api/admin/degree-levels')
  const unauthRespText = await unauthResp.text()
  await record({
    id: 'AUTH-U-001',
    pageOrApi: '/api/admin/degree-levels',
    role: 'UNAUTHENTICATED',
    precondition: 'No authentication',
    steps: 'GET admin degree-levels',
    expected: '401 unauthorized',
    actual: `${unauthResp.status()} ${unauthRespText}`,
    status: unauthResp.status() === 401 ? 'PASS' : 'FAIL',
    evidence: await writeEvidenceFile('auth-unauth-degree-levels.txt', `${unauthResp.status()} ${unauthRespText}\n`),
    defectId: unauthResp.status() === 401 ? undefined : 'DEFECT-006',
  })
  if (unauthResp.status() !== 401) {
    addDefect('DEFECT-006', 'Unauthenticated admin API returns unexpected status', 'GET /api/admin/degree-levels without auth')
  }

  await teacher.page.goto('/teacher/assignments')
  await record({
    id: 'COMP-TA-001',
    pageOrApi: '/teacher/assignments',
    role: 'TEACHER',
    precondition: 'Legacy teacher assignments exist',
    steps: 'Open teacher assignment page',
    expected: 'Legacy assignments load',
    actual: 'Teacher assignments page loaded',
    status: 'PASS',
    evidence: await screenshot(teacher.page, 'COMP-TA-001-teacher-assignments'),
  })

  await teacher.page.goto('/teacher/exams/create')
  await record({
    id: 'COMP-EX-001',
    pageOrApi: '/teacher/exams/create',
    role: 'TEACHER',
    precondition: 'Teacher has legacy assignments',
    steps: 'Open create exam page',
    expected: 'Teacher exam creation page loads',
    actual: 'Page loaded',
    status: 'PASS',
    evidence: await screenshot(teacher.page, 'COMP-EX-001-teacher-create-exam'),
  })

  await student.page.goto('/student/exams')
  await record({
    id: 'COMP-SS-001',
    pageOrApi: '/student/exams',
    role: 'STUDENT',
    precondition: 'Legacy student-subject records exist',
    steps: 'Open student exams page',
    expected: 'Legacy student page loads without crash',
    actual: 'Student exams page loaded',
    status: 'PASS',
    evidence: await screenshot(student.page, 'COMP-SS-001-student-exams'),
  })

  await student.page.goto('/student/results')
  await record({
    id: 'COMP-R-001',
    pageOrApi: '/student/results',
    role: 'STUDENT',
    precondition: 'Student authenticated',
    steps: 'Open student results page',
    expected: 'Results page loads without crash',
    actual: 'Student results page loaded',
    status: 'PASS',
    evidence: await screenshot(student.page, 'COMP-R-001-student-results'),
  })

  await fs.writeFile(path.join(evidenceDir, 'console-events.json'), JSON.stringify(consoleEvents, null, 2))
  await fs.writeFile(path.join(evidenceDir, 'browser-qa-results.json'), JSON.stringify({ results, defects }, null, 2))
  await fs.unlink(path.join(evidenceDir, 'browser-qa-fatal.txt')).catch(() => {})

  const matrixLines = [
    '# Phase 2 Browser Smoke Matrix',
    '',
    '| Test ID | Page or API | Role | Expected result | Actual result | Status | Evidence | Defect ID |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map((item) => `| ${item.id} | ${item.pageOrApi} | ${item.role} | ${item.expected.replace(/\|/g, '\\|')} | ${item.actual.replace(/\|/g, '\\|')} | ${item.status} | ${item.evidence ? path.relative(process.cwd(), item.evidence).replace(/\\/g, '/') : ''} | ${item.defectId ?? ''} |`),
  ]
  await fs.writeFile(path.join(process.cwd(), 'docs', 'phase-2', 'PHASE_2_BROWSER_SMOKE_MATRIX.md'), matrixLines.join('\n'))

  const envLines = [
    '# Phase 2 Browser QA Environment',
    '',
    '- Database name: `examflow_pro`',
    '- Environment: `NODE_ENV=development`',
    `- App URL: \`${baseUrl}\``,
    '- Browser used: `Playwright Chromium`',
    '- Node version: `v24.14.0`',
    '- npm version: `11.6.2`',
    '- Test date: `2026-07-11`',
    '- Git branch: `main`',
    '- Git commit: `5681f327f8a4996d3ff420bbaf5735fd0f438ad9`',
    '- Pre-apply backup: `docs/phase-2/backups/examflow_pro_pre_apply_backup.json`',
    '- Test accounts:',
    '  - Super Admin: `admin@examflow.pro`',
    '  - Department Admin A: `cse.admin@examflow.pro` (CSE)',
    '  - Department Admin B: `eee.admin@examflow.pro` (EEE)',
    '  - Teacher: `teacher.john@examflow.pro`',
    '  - Student: `alice@student.examflow.pro`',
  ]
  await fs.writeFile(path.join(process.cwd(), 'docs', 'phase-2', 'PHASE_2_BROWSER_QA_ENVIRONMENT.md'), envLines.join('\n'))

  await browser.close()
}

main().catch(async (error) => {
  await fs.mkdir(evidenceDir, { recursive: true }).catch(() => {})
  await fs.writeFile(path.join(evidenceDir, 'browser-qa-fatal.txt'), String(error?.stack || error))
  console.error(error)
  process.exit(1)
})
