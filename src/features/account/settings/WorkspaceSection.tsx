// src/features/account/settings/WorkspaceSection.tsx
//
// Workspace name + URL slug, default member role, and SSO requirement.
// SSO is a Team-plan-only toggle (badge shown when not on Team).

import { ShieldCheck, Users } from 'lucide-react'
import type { WorkspaceRole, WorkspaceSettings } from '../types'
import { Card, Field, Row, Toggle, inputCls } from '../components/primitives'

interface Props {
  workspace: WorkspaceSettings
  onChange: (patch: Partial<WorkspaceSettings>) => void
}

const ROLES: WorkspaceRole[] = ['viewer', 'editor', 'admin']

export function WorkspaceSection({ workspace, onChange }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Workspace name">
            <input
              value={workspace.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className={inputCls()}
            />
          </Field>
          <Field label="URL slug" hint="tucaken.com/{slug}">
            <div className="flex">
              <span className="flex items-center rounded-l-md border border-r-0 border-white/10 bg-white/[0.02] px-3 text-xs text-zinc-500">
                tucaken.com/
              </span>
              <input
                value={workspace.slug}
                onChange={(e) => onChange({ slug: e.target.value })}
                className={inputCls() + ' !rounded-l-none'}
              />
            </div>
          </Field>
        </div>
      </Card>
      <Card>
        <div className="space-y-3">
          <Row
            icon={<Users className="size-4 text-zinc-300" />}
            title="Default role for new members"
            sub="Applies when someone joins via invite link or SSO."
            action={
              <div className="inline-flex rounded-md border border-white/10 bg-zinc-950/40 p-0.5 text-xs">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onChange({ defaultRoleForNewMembers: role })}
                    className={[
                      'rounded px-3 py-1 capitalize transition whitespace-nowrap',
                      workspace.defaultRoleForNewMembers === role
                        ? 'bg-white/[0.06] text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                  >
                    {role}
                  </button>
                ))}
              </div>
            }
          />
          <Row
            icon={<ShieldCheck className="size-4 text-zinc-300" />}
            title="Require SSO for new sign-ins"
            sub="Members must sign in via your configured identity provider."
            badge={
              !workspace.requireSso && (
                <span className="whitespace-nowrap rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300 ring-1 ring-amber-400/20">
                  Team plan
                </span>
              )
            }
            action={
              <Toggle
                checked={workspace.requireSso}
                onChange={(v) => onChange({ requireSso: v })}
                label="SSO"
              />
            }
          />
        </div>
      </Card>
    </div>
  )
}
