import React from 'react'
import type { AppState } from './state'
import { getResumeBlocks, THEME_CSS } from './themes'
import { PaginatedDoc, getCoverBlocks, COVER_CSS, A4_W } from './preview'

/**
 * Read-only styled renderer shared with the resume builder.
 *
 * Renders a builder `AppState`'s resume (or cover) through the EXACT same block
 * pipeline + theme the editor's preview pane uses
 * (`getResumeBlocks`/`getCoverBlocks` -> `PaginatedDoc`). Driving a standalone
 * preview through this guarantees it is identical — data AND style — to what the
 * editor shows, with the builder as the single source of truth. Auto-scales to
 * its container width.
 */
export function ResumeThemeDocument({
  state,
  view = 'resume',
}: {
  readonly state: AppState
  readonly view?: 'resume' | 'cover'
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(0.72)

  // Inject the theme/cover stylesheet once (mirrors ResumeBuilderApp).
  React.useEffect(() => {
    if (document.getElementById('resume-theme-doc-css')) return
    const el = document.createElement('style')
    el.id = 'resume-theme-doc-css'
    el.textContent = THEME_CSS + '\n' + COVER_CSS
    document.head.appendChild(el)
  }, [])

  // Fit the A4 page to the container width (same approach as the editor pane).
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(Math.min(1, (el.clientWidth - 48) / A4_W))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const blocks =
    view === 'resume'
      ? getResumeBlocks(state.resume)
      : getCoverBlocks(state.resume, state.cover)

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {blocks.length > 0 && (
        <PaginatedDoc
          blocks={blocks}
          margin={Math.round(state.margins * 96)}
          theme={state.theme}
          scale={scale}
          coverMode={view === 'cover'}
          domId="resume-theme-preview-doc"
        />
      )}
    </div>
  )
}
