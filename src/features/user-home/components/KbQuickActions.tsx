'use client'

import { Link } from '@tanstack/react-router'
import { Bot, Upload, GitBranch, Briefcase } from 'lucide-react'

export function KbQuickActions() {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-100">Quick Actions</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

        <Link
          to="/applications/new"
          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/4 p-4 transition-all hover:border-teal-500/30 hover:bg-white/4"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <Bot className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Resume Analysis</p>
            <p className="text-xs text-zinc-500">Create a new resume analysis</p>
          </div>
        </Link>

        <Link
          to="/settings/github"
          search={{ tab: 'resumes' }}
          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/4 p-4 transition-all hover:border-teal-500/30 hover:bg-white/4"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <Upload className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Upload Resume</p>
            <p className="text-xs text-zinc-500">Add a PDF to your knowledge base</p>
          </div>
        </Link>

        <Link
          to="/settings/github"
          search={{ tab: 'repositories' }}
          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/4 p-4 transition-all hover:border-teal-500/30 hover:bg-white/4"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <GitBranch className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Connect Repo</p>
            <p className="text-xs text-zinc-500">Index a GitHub repository</p>
          </div>
        </Link>

        <Link
          to="/applications"
          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/4 p-4 transition-all hover:border-teal-500/30 hover:bg-white/4"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <Briefcase className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Applications</p>
            <p className="text-xs text-zinc-500">Track your job pipeline</p>
          </div>
        </Link>

      </div>
    </section>
  )
}
