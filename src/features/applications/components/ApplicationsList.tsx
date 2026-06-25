import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Target,
  Search,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { useApplications } from '@/hooks/use-admin-applications'
import { useApplicationsStore } from '@/lib/stores/applications-store'
import type { ApplicationStatus } from '@/lib/types/applications.types'
import { STATUS_FILTER_OPTIONS, STATUS_LABELS } from './ApplicationTypes'
import { ApplicationListRow } from './ApplicationListRow'
import { CustomDropDown } from '@/components/ui/CustomDropDown'
import { CommandPallete } from '@/components/ui/CommandPallete'
import type { CommandPalleteItem } from '@/components/ui/CommandPallete'
import { Pagination } from '@/components/ui/Pagination'
import { useTailoredResumes, buildTailoredMap } from '../hooks/use-tailored-resumes'
import { ResumePreviewDrawer } from '@/features/resumes/components/ResumePreviewDrawer'
import { CoverLetterForm } from './CoverLetterForm'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import { resolveResumeId } from '../utils/promote-resume'
import { getResumesFn, createResumeFn } from '@/server/resumes'
import { updateApplicationCoverLetterFn } from '@/server/applications'
import type { TailoredResumeSummary } from '@/server/applications'
import { useToastStore } from '@/lib/stores/toast-store'
import { adminKeys } from '@/lib/api/query-keys'
import type { AdminResumeWithData } from '../hooks/use-resume-versions'

type SelectedKind = 'preview-resume' | 'preview-cl' | 'edit-cl'
interface Selected { slug: string; kind: SelectedKind }

/** Build a typed AdminResumeWithData from a TailoredResumeSummary for the preview drawer. */
function toDrawerResume(tr: TailoredResumeSummary): AdminResumeWithData {
  return {
    resumeId: tr.slug,
    label: `${tr.targetCompany} — ${tr.targetRole}`,
    isActive: false,
    createdAt: tr.updatedAt,
    updatedAt: tr.updatedAt,
    data: tr.data as unknown as Record<string, unknown>,
  }
}

export function ApplicationsList({ initialStage }: { readonly initialStage?: string }) {
  const navigate = useNavigate()

  const statusFilter = useApplicationsStore((s) => s.activeStatusFilter)
  const setStatusFilter = useApplicationsStore((s) => s.setStatusFilter)
  const searchQuery = useApplicationsStore((s) => s.searchQuery)

  const [palleteOpen, setPalleteOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  useEffect(() => {
    if (initialStage) {
      setStatusFilter(initialStage as ApplicationStatus | 'all')
    }
  }, [initialStage, setStatusFilter])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, searchQuery])

  // Optional: Add global CMD+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPalleteOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // TanStack Query data
  const {
    data: applications,
    isLoading,
    error,
  } = useApplications(statusFilter)

  const { data: tailoredList } = useTailoredResumes()
  const tailoredMap = buildTailoredMap(tailoredList)
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [selected, setSelected] = useState<Selected | null>(null)

  const selectedTailored: TailoredResumeSummary | null = selected ? (tailoredMap.get(selected.slug) ?? null) : null

  const handleEditResume = async (tr: TailoredResumeSummary) => {
    try {
      const id = await resolveResumeId(
        { label: `${tr.targetCompany} — ${tr.targetRole}`, data: tr.data },
        getResumesFn,
        createResumeFn,
      )
      navigate({ to: '/resumes/edit/$id', params: { id } })
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Could not open the resume editor')
    }
  }

  const handleSaveCoverLetter = async (content: string) => {
    if (!selected || !selectedTailored?.coverLetter) return
    const next = { ...selectedTailored.coverLetter, paragraphs: content.split('\n\n').filter(Boolean) }
    await updateApplicationCoverLetterFn({ data: { slug: selected.slug, coverLetter: next } })
    await queryClient.invalidateQueries({ queryKey: adminKeys.applications.all })
    await queryClient.invalidateQueries({ queryKey: adminKeys.applications.tailoredResumes })
    setSelected(null)
    addToast('success', 'Cover letter updated.')
  }

  // Client-side company name filter
  // We keep it just in case searchQuery is still populated externally, otherwise the Command Palette handles navigation
  const filteredApps = applications?.filter((app) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      app.targetCompany.toLowerCase().includes(query) ||
      app.targetRole.toLowerCase().includes(query) ||
      STATUS_LABELS[app.status].toLowerCase().includes(query) ||
      app.status.toLowerCase().includes(query)
    )
  }) ?? []

  const totalPages = Math.ceil(filteredApps.length / ITEMS_PER_PAGE)
  const paginatedApps = filteredApps.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Command Palette Items
  const commandItems = applications?.map((app) => ({
    id: app.slug,
    name: app.targetCompany,
    description: `${app.targetRole} · ${STATUS_LABELS[app.status]}`,
  })) ?? []

  const drawerResume = selected?.kind === 'preview-resume' && selectedTailored
    ? toDrawerResume(selectedTailored)
    : null

  const isPreviewOpen = selected?.kind === 'preview-resume' || selected?.kind === 'preview-cl'

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* Search Modal */}
      <CommandPallete
        open={palleteOpen}
        setOpen={setPalleteOpen}
        items={commandItems}
        placeholder="Jump to application..."
        onSelect={(item: CommandPalleteItem) => {
          navigate({ to: '/applications/$slug', params: { slug: item.id } })
        }}
      />

      {/* One coupled table: toolbar → headers → rows, all in a single surface. */}
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/2">
        {/* Toolbar — filters + search */}
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-3 dark:border-white/10 sm:flex-row sm:items-center">
          <div className="z-10 w-full sm:w-64">
            <CustomDropDown
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              onChange={(val: string) => setStatusFilter(val as ApplicationStatus | 'all')}
            />
          </div>

          <div className="group relative flex-1">
            <button
              type="button"
              onClick={() => setPalleteOpen(true)}
              className="flex w-full items-center justify-between rounded-md bg-zinc-100 py-1.5 pl-3 pr-2 text-sm text-zinc-500 outline-1 -outline-offset-1 outline-zinc-300 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-500 dark:bg-white/5 dark:text-zinc-400 dark:outline-white/10 dark:hover:bg-white/10"
            >
              <div className="flex items-center">
                <Search className="mr-2 h-4 w-4 text-zinc-500 group-hover:text-zinc-400" />
                <span>Search company or role...</span>
              </div>
              <kbd className="hidden items-center rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 font-sans text-xs text-zinc-500 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                <abbr title="Command" className="no-underline">⌘</abbr>K
              </kbd>
            </button>
          </div>
        </div>

        {/* Body */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          </div>
        )}

        {error && (
          <div className="m-3 flex items-center gap-3 rounded-md border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>Failed to load applications: {error.message}</span>
          </div>
        )}

        {!isLoading && !error && filteredApps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-700" />
            <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-400">No applications found</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-600">
              {searchQuery ? 'Try adjusting your search or filters' : 'Start by analysing a new job description above'}
            </p>
          </div>
        )}

        {!isLoading && !error && filteredApps.length > 0 && (
          <>
            {/* Column headers — aligned with ApplicationListRow's grid template. */}
            <div className="hidden grid-cols-[1.5fr_1.5fr_14rem_9rem_auto] items-center gap-4 border-b border-zinc-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-white/10 dark:text-zinc-500 sm:grid">
              <span>Company</span>
              <span>Position</span>
              <span>Stage</span>
              <span>Status</span>
              <span className="justify-self-end">Documents</span>
            </div>
            {/* Rows — divided, new applications append under the current ones. */}
            <div className="divide-y divide-zinc-200 dark:divide-white/10">
              {paginatedApps.map((app) => {
                const tr = tailoredMap.get(app.slug) ?? null
                return (
                  <ApplicationListRow
                    key={app.slug}
                    app={app}
                    tailored={tr}
                    onOpen={() => navigate({ to: '/applications/$slug', params: { slug: app.slug } })}
                    onPreviewResume={() => setSelected({ slug: app.slug, kind: 'preview-resume' })}
                    onEditResume={() => { if (tr) void handleEditResume(tr) }}
                    onPreviewCoverLetter={() => setSelected({ slug: app.slug, kind: 'preview-cl' })}
                    onEditCoverLetter={() => setSelected({ slug: app.slug, kind: 'edit-cl' })}
                  />
                )
              })}
            </div>
            {totalPages > 1 && (
              <div className="border-t border-zinc-200 p-3 dark:border-white/10">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      <ResumePreviewDrawer
        isOpen={isPreviewOpen}
        onClose={() => setSelected(null)}
        resume={drawerResume}
        coverLetter={selected?.kind === 'preview-cl' ? (selectedTailored?.coverLetter ?? null) : null}
        coverLetterProfile={selectedTailored?.data.profile}
        coverLetterCompany={selectedTailored?.targetCompany}
        coverLetterRole={selectedTailored?.targetRole}
        onDownload={() => {}}
        isDownloading={false}
      />

      <DashboardDrawer
        isOpen={selected?.kind === 'edit-cl'}
        onClose={() => setSelected(null)}
        title="Edit Cover Letter"
        description={selectedTailored ? `${selectedTailored.targetCompany} — ${selectedTailored.targetRole}` : ''}
      >
        {selected?.kind === 'edit-cl' && selectedTailored?.coverLetter && (
          <CoverLetterForm
            initialContent={selectedTailored.coverLetter.paragraphs.join('\n\n')}
            onSubmit={handleSaveCoverLetter}
            onCancel={() => setSelected(null)}
          />
        )}
      </DashboardDrawer>
    </div>
  )
}
