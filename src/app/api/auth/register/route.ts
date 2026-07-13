import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enforceAuthRateLimit } from '@/lib/auth-rate-limit'
import { registerStudentSchema } from '@/lib/validators'
import bcrypt from 'bcryptjs'
import { UserRole } from '@prisma/client'
import { createEmailVerificationCode, sendOneTimeCodeEmail } from '@/lib/auth-code'
import { getActiveRegistrationFields, validateRegistrationFieldResponses } from '@/lib/registration-fields'
import { isEmailVerificationRequired } from '@/lib/system-settings'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = registerStudentSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { email, password, name, course, departmentId, subjectId, languageId, groupId, academicYearId, semesterId, phone, customFieldResponses } = parsed.data

  const rateLimitResponse = await enforceAuthRateLimit({
    req,
    action: 'register',
    accountKey: email,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

  const [dept, year, group, language, semester, subject] = await Promise.all([
    prisma.department.findFirst({ where: { id: departmentId, isActive: true } }),
    prisma.academicYear.findFirst({ where: { id: academicYearId, isActive: true } }),
    prisma.group.findFirst({ where: { id: groupId, academicYearId, isActive: true } }),
    prisma.language.findFirst({ where: { id: languageId, isActive: true } }),
    prisma.semester.findFirst({ where: { id: semesterId, isActive: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, departmentId, isActive: true } }),
  ])

  if (!dept) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
  if (!year) return NextResponse.json({ error: 'Invalid academic year' }, { status: 400 })
  if (!group) return NextResponse.json({ error: 'Group does not belong to this academic year' }, { status: 400 })
  if (!language) return NextResponse.json({ error: 'Invalid department language' }, { status: 400 })
  if (!semester) return NextResponse.json({ error: 'Invalid semester' }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'Subject does not belong to this department' }, { status: 400 })

  const dynamicFields = await getActiveRegistrationFields(departmentId)
  const dynamicValidation = validateRegistrationFieldResponses(dynamicFields, customFieldResponses)
  if (!dynamicValidation.valid) {
    return NextResponse.json({ error: dynamicValidation.error }, { status: 400 })
  }

  const hashedPwd = await bcrypt.hash(password, 12)
  const requireVerification = await isEmailVerificationRequired()

  const verification = requireVerification ? createEmailVerificationCode() : null

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPwd,
      name,
      role: UserRole.STUDENT,
      isEmailVerified: !requireVerification,
      emailVerificationCode: verification?.code ?? null,
      emailVerificationExpiresAt: verification?.expiresAt ?? null,
      studentProfile: {
        create: {
          departmentId,
          phone,
          customFieldResponses: {
            course,
            ...(customFieldResponses ?? {}),
          },
          subjects: {
            create: {
              subjectId,
              languageId,
              groupId,
              academicYearId,
              semesterId,
            },
          },
        },
      },
    },
    select: { id: true, email: true, name: true, role: true },
  })

  const delivery = requireVerification && verification
    ? await sendOneTimeCodeEmail({
        email,
        code: verification.code,
        purpose: 'verify-account',
        name,
      })
    : { sent: false as const }

  return NextResponse.json({
    user,
    email,
    requiresVerification: requireVerification,
    debugCode: delivery.debugCode,
    message: requireVerification
      ? delivery.sent
        ? 'Registration successful. Verification code sent to your email.'
        : 'Registration successful. Verification code generated for your account.'
      : 'Registration successful. Your account is ready to sign in.',
  }, { status: 201 })
}
