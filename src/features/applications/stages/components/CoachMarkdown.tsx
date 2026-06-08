import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { stripCdata } from '../lib/coaching-sections'

/**
 * Render coach-authored markdown (coaching notes) safely. react-markdown emits
 * React elements and escapes raw HTML by default, so LLM output can't inject
 * markup; remark-gfm adds tables, task checkboxes, and autolinks. Styled with
 * the Tailwind Typography `prose` tokens (dual-mode). Any leaked `<![CDATA[…]]>`
 * wrapper is stripped first.
 */
export function CoachMarkdown({ text }: { readonly text: string }) {
  return (
    <div className="prose prose-sm max-w-none leading-relaxed dark:prose-invert prose-headings:font-semibold prose-headings:text-zinc-900 prose-p:text-zinc-700 prose-li:my-0.5 prose-li:text-zinc-700 prose-strong:text-zinc-900 dark:prose-headings:text-zinc-100 dark:prose-p:text-zinc-300 dark:prose-li:text-zinc-300 dark:prose-strong:text-zinc-100">
      <Markdown remarkPlugins={[remarkGfm]}>{stripCdata(text)}</Markdown>
    </div>
  )
}
