// src/features/account/settings/DataSection.tsx
//
// Export your data, archive old generations, link to legal.

import { Archive, Download, ExternalLink } from 'lucide-react'
import { Card, Row } from '../components/primitives'

export function DataSection() {
  return (
    <Card>
      <div className="space-y-3">
        <Row
          icon={<Download className="size-4 text-zinc-300" />}
          title="Export your data"
          sub="ZIP archive with all your resumes, articles, profile data, and integration logs. Emailed when ready (~5 min)."
          action={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <Download className="size-3.5" /> Request export
            </button>
          }
        />
        <Row
          icon={<Archive className="size-4 text-zinc-300" />}
          title="Archive old generations"
          sub="Move resumes & articles older than 90 days to cold storage. They stay accessible but won't show in lists."
          action={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <Archive className="size-3.5" /> Archive now
            </button>
          }
        />
        <Row
          icon={<ExternalLink className="size-4 text-zinc-300" />}
          title="Privacy policy & terms"
          sub="Last accepted on Aug 22, 2024."
          action={
            <a
              href="/legal"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <ExternalLink className="size-3.5" /> View
            </a>
          }
        />
      </div>
    </Card>
  )
}
