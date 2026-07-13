import { StudentEnrollmentStatus, PrismaClient } from '@prisma/client'
const x: StudentEnrollmentStatus = StudentEnrollmentStatus.ACTIVE
const p = new PrismaClient()
console.log(x, typeof p)
