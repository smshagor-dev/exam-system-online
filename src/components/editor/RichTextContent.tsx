'use client'

type Props = {
  html: string
  className?: string
}

export default function RichTextContent({ html, className }: Props) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
