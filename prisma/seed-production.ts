import { PrismaClient } from '@prisma/client/index'

const prisma = new PrismaClient()

const SYSTEM_LANGUAGES = [
  { code: 'EN', name: 'English', isDefault: true },
  { code: 'BN', name: 'Bangla', isDefault: false },
  { code: 'AR', name: 'Arabic', isDefault: false },
]

async function runProductionSeed() {
  if (process.env.ALLOW_DEMO_SEED === 'true' || process.env.ALLOW_TEST_FIXTURES === 'true') {
    throw new Error('Production seed refuses to run while demo or test fixture flags are enabled.')
  }

  for (const language of SYSTEM_LANGUAGES) {
    await prisma.systemLanguage.upsert({
      where: { code: language.code },
      update: {
        name: language.name,
        isActive: true,
        isDefault: language.isDefault,
      },
      create: {
        code: language.code,
        name: language.name,
        isActive: true,
        isDefault: language.isDefault,
      },
    })
  }

  await prisma.systemSetting.upsert({
    where: { key: 'global' },
    update: {
      requireEmailVerification: true,
    },
    create: {
      key: 'global',
      systemName: 'ExamFlow Pro',
      systemShortName: 'EMS',
      systemDescription: 'Professional Online Exam Management System',
      aiEnabled: false,
      aiTemperature: 0.2,
      aiOpenAiModel: 'gpt-4o-mini',
      aiGeminiModel: 'gemini-2.5-flash',
      aiClaudeModel: 'claude-sonnet-4-20250514',
      requireEmailVerification: true,
    },
  })

  console.log('Production seed completed successfully.')
  console.log(`System languages ensured: ${SYSTEM_LANGUAGES.length}`)
  console.log('System settings ensured: global')
}

runProductionSeed()
  .catch((error) => {
    console.error('Production seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
