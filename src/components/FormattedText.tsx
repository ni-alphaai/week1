import { Fragment } from 'react'

// Renders a tiny subset of markdown used in lesson copy: **bold** spans.
// Newlines are preserved by the parent's `whitespace-pre-line`.
const BOLD = /\*\*([^*]+)\*\*/g

export interface RichSegment {
  text: string
  bold: boolean
}

// Splits copy into plain/bold runs so we can reveal it character-by-character
// without ever showing raw ** markers mid-stream.
export function parseRich(text: string): RichSegment[] {
  const segments: RichSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  BOLD.lastIndex = 0
  while ((match = BOLD.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index), bold: false })
    segments.push({ text: match[1], bold: true })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), bold: false })
  return segments
}

export function richLength(segments: RichSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.text.length, 0)
}

interface FormattedTextProps {
  text: string
  /** When set, only the first `reveal` visible characters are shown (typewriter). */
  reveal?: number
}

export function FormattedText({ text, reveal }: FormattedTextProps) {
  const segments = parseRich(text)
  let remaining = reveal ?? Infinity

  return (
    <>
      {segments.map((segment, index) => {
        if (remaining <= 0) return null
        const shown = remaining >= segment.text.length ? segment.text : segment.text.slice(0, remaining)
        remaining -= segment.text.length
        if (segment.bold) return <strong key={index}>{shown}</strong>
        return <Fragment key={index}>{shown}</Fragment>
      })}
    </>
  )
}
