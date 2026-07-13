'use client'

import { sanitizeRichHtml } from '@/lib/safe-html'

type Props = {
  html: string
  className?: string
}

export default function RichTextContent({ html, className }: Props) {
  const sanitizedHtml = sanitizeRichHtml(html)

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
