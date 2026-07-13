const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'meta',
  'link',
  'base',
])

const ALLOWED_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])

const GLOBAL_ALLOWED_ATTRIBUTES = new Set(['class', 'title', 'lang', 'dir'])
const LINK_ALLOWED_ATTRIBUTES = new Set(['href', 'target', 'rel'])
const TABLE_ALLOWED_ATTRIBUTES = new Set(['colspan', 'rowspan', 'scope'])

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isSafeUrl(value: string) {
  const normalized = decodeHtmlEntities(value).trim().replace(/[\u0000-\u001F\u007F\s]+/g, '')
  if (!normalized) return false
  if (normalized.startsWith('#') || normalized.startsWith('/')) return true
  return /^(https?:|mailto:|tel:)/i.test(normalized)
}

function sanitizeTagAttributes(tagName: string, rawAttributes: string) {
  const attributes: string[] = []
  const pattern = /([a-zA-Z0-9:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(rawAttributes)) !== null) {
    const name = match[1].toLowerCase()
    const value = match[3] ?? match[4] ?? match[5] ?? ''

    if (name.startsWith('on')) continue
    if (name === 'style') continue

    const allowedForTag =
      tagName === 'a'
        ? LINK_ALLOWED_ATTRIBUTES
        : tagName === 'td' || tagName === 'th'
          ? TABLE_ALLOWED_ATTRIBUTES
          : new Set<string>()

    if (!GLOBAL_ALLOWED_ATTRIBUTES.has(name) && !allowedForTag.has(name)) {
      continue
    }

    if (name === 'href' && !isSafeUrl(value)) {
      continue
    }

    if (name === 'target') {
      const normalizedTarget = value.trim().toLowerCase()
      if (!['_blank', '_self'].includes(normalizedTarget)) {
        continue
      }
      attributes.push(`target="${escapeHtmlAttribute(normalizedTarget)}"`)
      continue
    }

    if (name === 'rel') {
      attributes.push('rel="noopener noreferrer"')
      continue
    }

    attributes.push(`${name}="${escapeHtmlAttribute(value.trim())}"`)
  }

  if (tagName === 'a' && !attributes.some((attribute) => attribute.startsWith('rel='))) {
    attributes.push('rel="noopener noreferrer"')
  }

  return attributes.length > 0 ? ` ${attributes.join(' ')}` : ''
}

export function sanitizeRichHtml(input: string | null | undefined) {
  if (!input) return ''

  let sanitized = input
    .replace(/\u0000/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|svg|math|meta|link|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|svg|math|meta|link|base)[^>]*\/?\s*>/gi, '')

  sanitized = sanitized.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (fullMatch, rawTagName, rawAttributes) => {
    const tagName = String(rawTagName).toLowerCase()
    const isClosingTag = fullMatch.startsWith('</')

    if (BLOCKED_TAGS.has(tagName)) {
      return ''
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      return ''
    }

    if (isClosingTag) {
      return `</${tagName}>`
    }

    const safeAttributes = sanitizeTagAttributes(tagName, String(rawAttributes ?? ''))
    const selfClosing = /\/\s*>$/.test(fullMatch) || tagName === 'br' || tagName === 'hr'
    return `<${tagName}${safeAttributes}${selfClosing ? ' />' : '>'}`
  })

  return sanitized.trim()
}
