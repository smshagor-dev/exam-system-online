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

  // Validate department exists
  const dept = await prisma.department.findUnique({ where: { id: departmentId } })
  if (!dept) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })

  // Validate subject belongs to department
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, departmentId } })
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
