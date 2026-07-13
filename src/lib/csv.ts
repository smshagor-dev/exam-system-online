function sanitizeCell(value: unknown) {
  const normalized = String(value ?? '')
  const prefixed = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized
  return `"${prefixed.replace(/"/g, '""')}"`
}

export function buildCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [
    headers.map(sanitizeCell).join(','),
    ...rows.map((row) => row.map(sanitizeCell).join(',')),
  ].join('\n')
}

