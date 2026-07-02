import React from 'react'
import { Link } from '@tanstack/react-router'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import { ChevronDownIcon, ArrowDownTrayIcon } from '@heroicons/react/20/solid'
import './style.css'
import {
  useStore, setView, setTheme, setMargins, resetState, updateResume, subscribe, uid,
  type AppState,
} from './state'
import {
  getResumeBlocks, THEME_CSS, SECTION_LABEL,
  type ThemeName,
} from './themes'
import {
  PaginatedDoc, getCoverBlocks, COVER_CSS, A4_W,
} from './preview'
import {
  Accordion, moveItem,
  ProfileEditor, SummaryEditor, ExperienceEditor, EducationEditor,
  ProjectsEditor, SkillsEditor, CertsEditor, LangEditor, CustomEditor, CoverEditor,
} from './editor'
import {
  buildResumeTxt, buildCoverTxt, buildResumeDoc, buildCoverDoc,
  downloadTxt, downloadDoc, downloadPdf, sanitizeFilename,
} from './downloads'

export function ResumeBuilderApp({
  onClose,
  onSave,
  serverPdfLoader,
}: {
  onClose?: () => void
  onSave?: () => void
  /**
   * Optional loader for the canonical server-rendered ATS PDF (resume view
   * only). Returns a presigned URL, or `null` when none exists yet — in which
   * case the download falls back to the client-side raster renderer. Supplied
   * by the application editor (which knows the slug); absent for the standalone
   * `/resume-theme` wireframe, where only the raster path exists.
   */
  serverPdfLoader?: (filename: string) => Promise<{ url: string } | null>
} = {}) {
  const state = useStore((s) => s)

  React.useEffect(() => {
    if (document.getElementById('resume-theme-doc-css')) return
    const el = document.createElement('style')
    el.id = 'resume-theme-doc-css'
    el.textContent = THEME_CSS + '\n' + COVER_CSS
    document.head.appendChild(el)
  }, [])
  const { resume, cover, theme, view, margins } = state
  const marginPx = Math.round(margins * 96)

  const blocks = React.useMemo(
    () =>
      view === 'resume'
        ? getResumeBlocks(resume)
        : getCoverBlocks(resume, cover),
    [view, resume, cover],
  )

  const previewRef = React.useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = React.useState(0.72)

  React.useEffect(() => {
    if (!previewRef.current) return
    const el = previewRef.current
    const update = () => {
      const w = el.clientWidth - 48
      const s = Math.min(1, w / A4_W)
      setPreviewScale(s)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="main" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <TopBar state={state} theme={theme} view={view} margins={margins} onClose={onClose} onSave={onSave} serverPdfLoader={serverPdfLoader} />
      <div className="workspace">
        <FormPanel state={state} />
        <div className="preview-pane" ref={previewRef}>
          <div className="preview-inner">
            {blocks.length > 0 && (
              <PaginatedDoc
                blocks={blocks}
                margin={marginPx}
                theme={theme}
                scale={previewScale}
                coverMode={view === 'cover'}
                domId="capture-doc"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TopBar({
  state,
  theme,
  view,
  margins,
  onClose,
  onSave,
  serverPdfLoader,
}: {
  state: AppState;
  theme: ThemeName;
  view: AppState['view'];
  margins: number;
  onClose?: () => void;
  onSave?: () => void;
  serverPdfLoader?: (filename: string) => Promise<{ url: string } | null>;
}) {
  const [savedFlash, setSavedFlash] = React.useState(false)

  React.useEffect(() => {
    const unsub = subscribe(() => {
      setSavedFlash(true)
      const t = setTimeout(() => setSavedFlash(false), 900)
      return () => clearTimeout(t)
    })
    return () => { unsub() }
  }, [])

  const baseName = React.useMemo(() => {
    const root = sanitizeFilename(state.resume.profile.name || 'resume') || 'resume'
    return `${root}_${view === 'resume' ? 'Resume' : 'CoverLetter'}`
  }, [state.resume.profile.name, view])

  const handleDownload = async (kind: 'pdf' | 'doc' | 'txt') => {
    if (kind === 'txt') {
      const txt =
        view === 'resume'
          ? buildResumeTxt(state.resume)
          : buildCoverTxt(state.resume, state.cover)
      downloadTxt(txt, baseName)
    } else if (kind === 'doc') {
      const html =
        view === 'resume'
          ? buildResumeDoc(state.resume, state.theme, Math.round(state.margins * 96))
          : buildCoverDoc(state.resume, state.cover, state.theme, Math.round(state.margins * 96))
      downloadDoc(html, baseName)
    } else {
      // Prefer the canonical server-rendered ATS PDF (real text layer, small,
      // ATS-parseable) for the resume. Fall back to the client raster only when
      // no server PDF exists yet or the lookup fails. Cover letters have no
      // server PDF today, so they always use the raster path.
      if (view === 'resume' && serverPdfLoader) {
        try {
          const server = await serverPdfLoader(baseName)
          if (server?.url) {
            const a = document.createElement('a')
            a.href = server.url
            a.rel = 'noopener'
            document.body.appendChild(a)
            a.click()
            a.remove()
            return
          }
        } catch (err) {
          console.error(err)
          // fall through to the raster renderer
        }
      }
      try {
        await downloadPdf('capture-doc', baseName)
      } catch (err) {
        console.error(err)
        alert('PDF generation failed. Please try again.')
      }
    }
  }

  return (
    <header className="flex items-center justify-between gap-x-4 px-4 sm:px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700/50 shrink-0 min-h-[56px]">
      {/* Left: breadcrumb + view tabs */}
      <div className="flex flex-col gap-y-1.5 min-w-0">
        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              ← Back
            </button>
          ) : (
            <Link to="/" className="font-medium text-teal-600 dark:text-teal-400 hover:underline">
              ← Dashboard
            </Link>
          )}
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
          Resumes
          <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {state.resume.profile.name || 'Untitled'}
          </span>
        </div>

        <div className="flex items-center gap-x-1">
          {(['resume', 'cover'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={[
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                view === v
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/60',
              ].join(' ')}
            >
              {v === 'resume' ? 'Resume' : 'Cover letter'}
            </button>
          ))}
        </div>
      </div>

      {/* Right: saved · theme · margin · download */}
      <div className="flex items-center gap-x-3 shrink-0">
        <span className={[
          'hidden sm:block text-xs transition-colors',
          savedFlash ? 'text-teal-600 dark:text-teal-400' : 'text-zinc-400 dark:text-zinc-500',
        ].join(' ')}>
          {savedFlash ? 'Saved' : 'All changes saved'}
        </span>

        <div className="hidden sm:block h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

        {/* Theme picker */}
        <SegmentedControl
          title="Theme"
          items={[
            { id: 'classic', label: 'Classic' },
            { id: 'modern', label: 'Modern' },
            { id: 'compact', label: 'Compact' },
          ]}
          value={theme}
          onChange={(v) => setTheme(v as ThemeName)}
        />

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

        {/* Margin picker */}
        <SegmentedControl
          title="Page margins"
          items={[
            { id: '0.5', label: '0.5"' },
            { id: '0.75', label: '0.75"' },
            { id: '1', label: '1"' },
          ]}
          value={String(margins)}
          onChange={(v) => setMargins(Number(v))}
        />

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-x-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-500 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            Save
          </button>
        )}

        {/* Download dropdown */}
        <Menu as="div" className="relative">
          <MenuButton className="inline-flex items-center gap-x-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-500 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
            <ArrowDownTrayIcon className="size-3.5" aria-hidden="true" />
            Download
            <ChevronDownIcon className="size-3 opacity-70" aria-hidden="true" />
          </MenuButton>
          <MenuItems
            transition
            className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-lg bg-white dark:bg-zinc-800 shadow-lg ring-1 ring-zinc-200 dark:ring-zinc-700/50 divide-y divide-zinc-100 dark:divide-zinc-700/50 outline-none transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
          >
            {([
              { kind: 'pdf' as const, ext: '.pdf', label: 'PDF', desc: 'Print-perfect · industry standard' },
              { kind: 'doc' as const, ext: '.doc', label: 'Word', desc: 'Editable in Word, Pages, Docs' },
              { kind: 'txt' as const, ext: '.txt', label: 'Plain text', desc: 'ATS-safe fallback' },
            ]).map(({ kind, ext, label, desc }) => (
              <div key={kind} className="py-1">
                <MenuItem>
                  <button
                    type="button"
                    onClick={() => void handleDownload(kind)}
                    className="group flex w-full items-center gap-x-3 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 data-focus:bg-zinc-50 dark:data-focus:bg-white/5 data-focus:text-zinc-900 dark:data-focus:text-white data-focus:outline-hidden"
                  >
                    <span className="shrink-0 font-mono text-xs font-semibold text-teal-600 dark:text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded">
                      {ext}
                    </span>
                    <div className="text-left">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{desc}</div>
                    </div>
                  </button>
                </MenuItem>
              </div>
            ))}
          </MenuItems>
        </Menu>
      </div>
    </header>
  )
}

function SegmentedControl({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div title={title} className="flex items-center gap-x-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={[
            'px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150',
            value === item.id
              ? 'scale-105 bg-teal-600/15 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 font-semibold shadow-sm'
              : 'scale-100 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:scale-105 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-600 dark:hover:text-teal-400',
          ].join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function FormPanel({ state }: { state: AppState }) {
  if (state.view === 'cover') {
    return (
      <div className="form-panel">
        <div className="form-scroll">
          <FormSectionHead>
            <span>Cover letter</span>
            <span className="muted">Identity & theme inherited from resume</span>
          </FormSectionHead>
          <CoverEditor />
        </div>
      </div>
    )
  }

  const { resume } = state
  const move = (idx: number, dir: -1 | 1) => {
    updateResume((r) => ({
      ...r,
      sectionOrder: moveItem(r.sectionOrder, idx, dir),
    }))
  }
  const removeSection = (key: string) => {
    updateResume((r) => ({
      ...r,
      sectionOrder: r.sectionOrder.filter((k) => k !== key),
      custom: r.custom.filter((c) => c.id !== key),
    }))
  }
  const addStandardSection = (key: string) => {
    updateResume((r) =>
      r.sectionOrder.includes(key)
        ? r
        : { ...r, sectionOrder: [...r.sectionOrder, key] },
    )
  }
  const addCustomSection = () => {
    const id = `custom-${uid()}`
    updateResume((r) => ({
      ...r,
      sectionOrder: [...r.sectionOrder, id],
      custom: [
        ...r.custom,
        { id, title: 'New section', entries: [{ id: uid(), heading: '', subheading: '', body: '' }] },
      ],
    }))
  }

  const renderSectionEditor = (key: string, idx: number) => {
    const isLast = idx === resume.sectionOrder.length - 1
    const isCustom = key.startsWith('custom-')
    const cs = resume.custom.find((c) => c.id === key)
    const title = SECTION_LABEL[key] ?? (cs?.title || 'Custom')
    let count: number | undefined
    let body: React.ReactNode = null
    switch (key) {
      case 'summary':
        body = <SummaryEditor value={resume.summary} />
        break
      case 'experience':
        count = resume.experience.length
        body = <ExperienceEditor items={resume.experience} />
        break
      case 'education':
        count = resume.education.length
        body = <EducationEditor items={resume.education} />
        break
      case 'projects':
        count = resume.projects.length
        body = <ProjectsEditor items={resume.projects} />
        break
      case 'skills':
        count = resume.skills.length
        body = <SkillsEditor items={resume.skills} />
        break
      case 'certifications':
        count = resume.certifications.length
        body = <CertsEditor items={resume.certifications} />
        break
      case 'languages':
        count = resume.languages.length
        body = <LangEditor items={resume.languages} />
        break
      default:
        if (cs) {
          count = cs.entries.length
          body = <CustomEditor section={cs} />
        }
    }
    return (
      <Accordion
        key={key}
        title={title}
        count={count}
        defaultOpen={idx === 0 && key === 'experience'}
        onMoveUp={idx > 0 ? () => move(idx, -1) : undefined}
        onMoveDown={!isLast ? () => move(idx, 1) : undefined}
        onRemove={() => removeSection(key)}
        removable={isCustom || key === 'languages' || key === 'certifications'}
      >
        {body}
      </Accordion>
    )
  }

  const missingStandard: { key: string; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'experience', label: 'Experience' },
    { key: 'education', label: 'Education' },
    { key: 'projects', label: 'Projects' },
    { key: 'skills', label: 'Skills' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'languages', label: 'Languages' },
  ].filter((s) => !resume.sectionOrder.includes(s.key))

  return (
    <div className="form-panel">
      <div className="form-scroll">
        <FormSectionHead>
          <span>Contact</span>
          <span className="muted">Shared with cover letter</span>
        </FormSectionHead>
        <Accordion title="Profile" defaultOpen>
          <ProfileEditor p={resume.profile} />
        </Accordion>

        <FormSectionHead>
          <span>Sections</span>
          <span className="muted">Drag arrows to reorder</span>
        </FormSectionHead>
        {resume.sectionOrder.map((k, i) => renderSectionEditor(k, i))}

        {missingStandard.length > 0 && (
          <div className="add-section-row">
            {missingStandard.map((s) => (
              <button
                key={s.key}
                className="add-pill"
                onClick={() => addStandardSection(s.key)}
              >
                + {s.label}
              </button>
            ))}
            <button className="add-pill custom" onClick={addCustomSection}>
              + Custom section
            </button>
          </div>
        )}

        <div className="reset-row">
          <button
            className="link-btn"
            onClick={() => {
              if (confirm('Reset everything to the sample data? This clears your work.')) {
                resetState()
              }
            }}
          >
            Reset to sample data
          </button>
        </div>
      </div>
    </div>
  )
}

function FormSectionHead({ children }: { children: React.ReactNode }) {
  return <div className="form-section-head">{children}</div>
}
