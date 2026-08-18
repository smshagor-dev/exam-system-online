'use client'

import { useMemo, useRef } from 'react'

const KEYWORDS = new Set(
  [
    'abstract','as','async','await','bool','boolean','break','byte','case','catch','char','class','const','continue','def','delete','do','double','else','enum','export','extends','false','final','finally','float','for','from','func','function','go','if','implements','import','in','include','int','interface','let','long','namespace','new','null','package','private','protected','public','return','rust','select','short','signed','sizeof','static','string','struct','super','switch','this','throw','throws','true','try','type','typeof','unsigned','using','var','void','while','with','yield','none','and','or','not','elif','lambda','pass','self','printf','cout','cin','std','console','log','SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','DROP','ALTER','JOIN','ON','GROUP','ORDER','BY','HAVING','LIMIT','AS','NULL','PRIMARY','KEY','FOREIGN','REFERENCES'
  ].map((item) => item.toLowerCase())
)

const TOKEN_PATTERN = /(\/\/.*$|\/\*.*?\*\/|#[A-Za-z_][A-Za-z0-9_<>./-]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*\b)/g

function tokenClass(token: string) {
  if (token.startsWith('//') || token.startsWith('/*')) return 'text-emerald-400'
  if (token.startsWith('#')) return 'text-fuchsia-400'
  if (/^["'`]/.test(token)) return 'text-amber-300'
  if (/^\d/.test(token)) return 'text-cyan-300'
  if (KEYWORDS.has(token.toLowerCase())) return 'text-violet-300'
  return 'text-slate-100'
}

function HighlightedLine({ line }: { line: string }) {
  const parts = useMemo(() => {
    const result: Array<{ text: string; className: string }> = []
    let cursor = 0
    for (const match of line.matchAll(TOKEN_PATTERN)) {
      const index = match.index ?? 0
      if (index > cursor) {
        result.push({ text: line.slice(cursor, index), className: 'text-slate-100' })
      }
      result.push({ text: match[0], className: tokenClass(match[0]) })
      cursor = index + match[0].length
    }
    if (cursor < line.length) {
      result.push({ text: line.slice(cursor), className: 'text-slate-100' })
    }
    return result.length ? result : [{ text: line || ' ', className: 'text-slate-100' }]
  }, [line])

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${index}-${part.text}`} className={part.className}>{part.text}</span>
      ))}
    </>
  )
}

function LanguageBadge({ language }: { language: string }) {
  return (
    <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
      {language || 'text'}
    </span>
  )
}

export function CodeBlock({
  code,
  language,
  label = 'Code',
}: {
  code: string
  language: string
  label?: string
}) {
  const lines = (code || '').replace(/\r\n/g, '\n').split('\n')

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        <LanguageBadge language={language} />
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <div className="grid min-w-max grid-cols-[3.25rem_1fr] font-mono text-[13px] leading-6">
          <pre className="select-none border-r border-slate-800 bg-slate-900/70 px-3 py-4 text-right text-slate-600">
            {lines.map((_, index) => `${index + 1}\n`).join('')}
          </pre>
          <pre className="m-0 whitespace-pre px-4 py-4 text-slate-100">
            {lines.map((line, index) => (
              <span key={index} className="block min-h-6"><HighlightedLine line={line} /></span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  )
}

export function CodeEditor({
  value,
  onChange,
  language,
  label = 'Code Editor',
  placeholder = 'Write code here...',
  readOnly = false,
  minHeight = 280,
}: {
  value: string
  onChange: (value: string) => void
  language: string
  label?: string
  placeholder?: string
  readOnly?: boolean
  minHeight?: number
}) {
  const highlightRef = useRef<HTMLPreElement | null>(null)
  const gutterRef = useRef<HTMLPreElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const normalized = value.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  const syncScroll = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    if (highlightRef.current) {
      highlightRef.current.scrollTop = textarea.scrollTop
      highlightRef.current.scrollLeft = textarea.scrollLeft
    }
    if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly || event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd
    const next = `${value.slice(0, start)}  ${value.slice(end)}`
    onChange(next)
    requestAnimationFrame(() => {
      target.selectionStart = start + 2
      target.selectionEnd = start + 2
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        <LanguageBadge language={language} />
      </div>
      <div className="grid grid-cols-[3.25rem_1fr]" style={{ height: minHeight }}>
        <pre
          ref={gutterRef}
          aria-hidden
          className="m-0 overflow-hidden border-r border-slate-800 bg-slate-900/70 px-3 py-4 text-right font-mono text-[13px] leading-6 text-slate-600"
        >
          {lines.map((_, index) => `${index + 1}\n`).join('')}
        </pre>
        <div className="relative min-w-0 overflow-hidden">
          <pre
            ref={highlightRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-4 font-mono text-[13px] leading-6"
          >
            {normalized.length === 0 ? (
              <span className="text-slate-600">{placeholder}</span>
            ) : (
              lines.map((line, index) => (
                <span key={index} className="block min-h-6"><HighlightedLine line={line} /></span>
              ))
            )}
          </pre>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            readOnly={readOnly}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            aria-label={label}
            className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent p-4 font-mono text-[13px] leading-6 text-transparent caret-white outline-none selection:bg-sky-500/35 disabled:cursor-not-allowed"
            style={{ WebkitTextFillColor: 'transparent' }}
          />
        </div>
      </div>
    </div>
  )
}
