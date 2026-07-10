import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can assign coursework' }, { status: 403 })
  }

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const body = await request.json()
  const studentId = String(body.studentId || '').trim()
  const subjectId = String(body.subjectId || '').trim()
  const languageId = String(body.languageId || '').trim()
  const groupId = String(body.groupId || '').trim()
  const academicYearId = String(body.academicYearId || '').trim()
  const semesterId = String(body.semesterId || '').trim()
  const title = String(body.title || '').trim()

  if (!studentId || !subjectId || !languageId || !groupId || !academicYearId || !semesterId) {
    return NextResponse.json({ error: 'Missing coursework scope fields' }, { status: 400 })
  }

  if (title.length < 2) {
    return NextResponse.json({ error: 'Title must be at least 2 characters long' }, { status: 400 })
  }

  const teacherAssignment = await prisma.teacherAssignment.findFirst({
    where: {
      teacherId: profile.id,
      subjectId,
      languageId,
      groupId,
      academicYearId,
      semesterId,
    },
    select: {
      departmentId: true,
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
    },
  })

  if (!teacherAssignment) {
    return NextResponse.json({ error: 'You are not assigned to this scope' }, { status: 403 })
  }

  const student = await prisma.studentProfile.findFirst({
    where: {
      id: studentId,
      departmentId: teacherAssignment.departmentId,
      subjects: {
        some: {
          subjectId,
          languageId,
          groupId,
          academicYearId,
          semesterId,
        },
      },
    },
    select: { id: true },
  })

  if (!student) {
    return NextResponse.json({ error: 'Student is not enrolled in the selected scope' }, { status: 404 })
  }

  const rule = await prisma.courseworkRule.findUnique({
    where: {
      teacherId_subjectId_languageId_groupId_academicYearId_semesterId: {
        teacherId: profile.id,
        subjectId,
        languageId,
        groupId,
        academicYearId,
        semesterId,
      },
    },
    select: {
      id: true,
      rules: true,
    },
  })

  if (!rule) {
    return NextResponse.json({ error: 'Save the shared rules first before assigning student titles' }, { status: 400 })
  }

  const assignment = await prisma.courseworkAssignment.upsert({
    where: {
      teacherId_studentId_subjectId_languageId_groupId_academicYearId_semesterId: {
        teacherId: profile.id,
        studentId,
        subjectId,
        languageId,
        groupId,
        academicYearId,
        semesterId,
      },
    },
    update: {
      ruleId: rule.id,
      title,
      rules: rule.rules,
    },
    create: {
      teacherId: profile.id,
      studentId,
      ruleId: rule.id,
      departmentId: teacherAssignment.departmentId,
      subjectId,
      languageId,
      groupId,
      academicYearId,
      semesterId,
      title,
      rules: rule.rules,
    },
  })

  return NextResponse.json(assignment)
}
