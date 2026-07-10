import { RegistrationFieldType } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type RegistrationFieldResponseValue = string | boolean

export async function getActiveRegistrationFields(departmentId: string) {
  return prisma.registrationField.findMany({
    where: {
      departmentId,
      isActive: true,
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })
}

export function buildRegistrationFieldKey(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function sanitizeRegistrationFieldOptions(options?: string[] | null) {
  return (options ?? [])
    .map((option) => option.trim())
    .filter(Boolean)
}

export function validateRegistrationFieldResponses(
  fields: Awaited<ReturnType<typeof getActiveRegistrationFields>>,
  responses?: Record<string, RegistrationFieldResponseValue>
) {
  const normalizedResponses = responses ?? {}

  for (const field of fields) {
    const value = normalizedResponses[field.key]

    if (field.type === RegistrationFieldType.CHECKBOX) {
      if (field.isRequired && value !== true) {
        return { valid: false, error: `${field.label} must be accepted.` }
      }
      continue
    }

    const textValue = typeof value === 'string' ? value.trim() : ''
    if (field.isRequired && !textValue) {
      return { valid: false, error: `${field.label} is required.` }
    }

    if (!textValue) continue

    if (field.type === RegistrationFieldType.SELECT) {
      const options = Array.isArray(field.options) ? field.options : []
      if (!options.includes(textValue)) {
        return { valid: false, error: `${field.label} has an invalid selection.` }
      }
    }
  }

  return { valid: true as const }
}
