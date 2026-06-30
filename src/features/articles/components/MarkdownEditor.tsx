import { useRef, useState } from 'react'
import { Tabs } from '@/components/ui/Tabs'
import { MdxPreview } from './MdxPreview'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  /** placeholder for the textarea; default 'Article MDX content…' */
  placeholder?: string
}

/**
 * Controlled Write/Preview markdown editor with char/line counters.
 * Owns only the active-tab toggle and textarea ref — all content state
 * lives in the parent (caller passes `value` / `onChange`).
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Article MDX content…',
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState('Write')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const lines = value.split('\n').length

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      {/* Info bar — char / line counts */}
      <div className="text-xs text-zinc-400">
        <span>
          {value.length.toLocaleString()} characters ·{' '}
          {lines.toLocaleString()} lines
        </span>
      </div>

      {/* Tab toggle */}
      <div className="flex-none">
        <Tabs
          tabs={[
            { name: 'Write', current: activeTab === 'Write' },
            { name: 'Preview', current: activeTab === 'Preview' },
          ]}
          onTabChange={setActiveTab}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'Write' ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 font-mono text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 shadow-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            placeholder={placeholder}
          />
        ) : (
          <div className="h-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-6 shadow-inner">
            <MdxPreview content={value} />
          </div>
        )}
      </div>
    </div>
  )
}
