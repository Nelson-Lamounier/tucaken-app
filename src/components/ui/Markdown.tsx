'use client'

import { useMemo } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Strip a complete XML CDATA wrapper that the Coach Agent occasionally bled into
 * free-text fields before the producer-side fix landed. Mirrors
 * `deepStripCdata` in ai-applications so already-persisted rows render cleanly
 * without a regeneration. Only a full wrapper is removed.
 */
const CDATA_WRAPPER = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/

function stripCdata(value: string): string {
  const match = CDATA_WRAPPER.exec(value)
  if (!match) return value
  return match[1].trim()
}

/**
 * Tailwind-styled element map. react-markdown does not render raw HTML by
 * default (no `rehype-raw`), so model-authored Markdown is rendered safely —
 * any embedded HTML is treated as text, not executed.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="mb-2 mt-4 first:mt-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-4 first:mt-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-4 first:mt-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{children}</h4>,
  ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed marker:text-zinc-400">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-zinc-800 dark:bg-white/10 dark:text-zinc-200">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-white/15 dark:text-zinc-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-zinc-200 dark:border-white/10" />,
  // GFM task-list checkbox — render the input but keep it inert/readonly.
  input: (props: ComponentPropsWithoutRef<'input'>) =>
    props.type === 'checkbox' ? (
      <input
        type="checkbox"
        checked={props.checked}
        readOnly
        className="mr-1.5 -mt-0.5 inline-block size-3.5 rounded-sm border-zinc-300 align-middle accent-accent dark:border-white/20"
      />
    ) : (
      <input {...props} />
    ),
}

interface MarkdownProps {
  readonly children: string
  /** Wrapper class — sets the base text colour/size for the rendered tree. */
  readonly className?: string
}

/**
 * Safe Markdown renderer for model-authored free text (coaching notes, etc.).
 * GitHub-flavoured (tables, task lists, strikethrough) via remark-gfm; raw HTML
 * is not executed. Strips a stray CDATA wrapper from legacy data.
 */
export function Markdown({ children, className }: MarkdownProps) {
  const source = useMemo(() => stripCdata(children), [children])
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
