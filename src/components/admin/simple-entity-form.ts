export type SimpleEntityFieldOption = {
  value: string
  label: string
  meta?: Record<string, string>
}

export type SimpleEntityField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'checkbox' | 'date' | 'datetime-local'
  required?: boolean
  options?: SimpleEntityFieldOption[]
  dependsOn?: string[]
}

export function getFilteredFieldOptions(field: SimpleEntityField, form: Record<string, string>) {
  const options = field.options ?? []
  if (!field.dependsOn?.length) return options

  return options.filter((option) =>
    field.dependsOn?.every((dependencyKey) => {
      const dependencyValue = form[dependencyKey]
      if (!dependencyValue) return false
      return option.meta?.[dependencyKey] === dependencyValue
    })
  )
}

export function reconcileDependentSelections(fields: SimpleEntityField[], form: Record<string, string>) {
  let changed = false
  let nextForm = { ...form }

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (field.type !== 'select') continue

    const value = nextForm[field.key] ?? ''
    if (!value) continue

    const availableOptions = getFilteredFieldOptions(field, nextForm)
    if (!availableOptions.some((option) => option.value === value)) {
      nextForm = { ...nextForm, [field.key]: '' }
      changed = true
      index = -1
    }
  }

  return changed ? nextForm : form
}
