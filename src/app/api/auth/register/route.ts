import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registerStudentSchema } from '@/lib/validators'
import bcrypt from 'bcryptjs'
import { UserRole } from '@prisma/client'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = registerStudentSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { email, password, name, departmentId, subjectId, languageId, groupId, academicYearId, semesterId, rollNumber, phone } = parsed.data

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

  const [dept, year, group, language, semester, subject] = await Promise.all([
    prisma.department.findFirst({ where: { id: departmentId, isActive: true } }),
    prisma.academicYear.findFirst({ where: { id: academicYearId, isActive: true } }),
    prisma.group.findFirst({ where: { id: groupId, isActive: true } }),
    prisma.language.findFirst({ where: { id: languageId, isActive: true } }),
    prisma.semester.findFirst({ where: { id: semesterId, isActive: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, departmentId, isActive: true } }),
  ])

  if (!dept) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
  if (!year) return NextResponse.json({ error: 'Invalid academic year' }, { status: 400 })
  if (!group) return NextResponse.json({ error: 'Invalid group' }, { status: 400 })
  if (!language) return NextResponse.json({ error: 'Invalid language' }, { status: 400 })
  if (!semester) return NextResponse.json({ error: 'Invalid semester' }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'Subject does not belong to this department' }, { status: 400 })

  const hashedPwd = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPwd,
      name,
      role: UserRole.STUDENT,
      studentProfile: {
        create: {
          departmentId,
          rollNumber,
          phone,
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

  return NextResponse.json({ user, message: 'Registration successful' }, { status: 201 })
}
