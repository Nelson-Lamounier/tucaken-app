// src/features/account/settings/SettingsPage.tsx
//
// Composes the Settings page sections. Renders WITHOUT a left nav — the
// host AppLayout supplies its own.

import {
  AlertTriangle,
  Archive,
  Building2,
  Cpu,
  FileText,
  Globe,
  Layout,
  Zap,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { PageNavSection, Settings, SettingsPageProps } from '../types'
import { PageSection, PageShell } from '../components/PageShell'
import { AppearanceSection } from './AppearanceSection'
import { LocaleSection } from './LocaleSection'
import { ResumeDefaultsSection } from './ResumeDefaultsSection'
import { WorkspaceSection } from './WorkspaceSection'
import { TokensSection } from './TokensSection'
import { WebhooksSection } from './WebhooksSection'
import { DataSection } from './DataSection'
import { DangerZoneSection } from './DangerZoneSection'
import { adminKeys } from '@/lib/api/query-keys'
import { getMeFn } from '@/server/me'

const SECTIONS: PageNavSection[] = [
  { id: 'appearance', label: 'Appearance',      icon: Layout         },
  { id: 'locale',     label: 'Locale & time',   icon: Globe          },
  { id: 'resumes',    label: 'Resume defaults', icon: FileText       },
  { id: 'workspace',  label: 'Workspace',       icon: Building2      },
  { id: 'tokens',     label: 'API tokens',      icon: Cpu            },
  { id: 'webhooks',   label: 'Webhooks',        icon: Zap            },
  { id: 'data',       label: 'Data & privacy',  icon: Archive        },
  { id: 'danger',     label: 'Danger zone',     icon: AlertTriangle  },
]

export function SettingsPage({ settings, onUpdateSettings }: SettingsPageProps) {
  // The danger zone needs the canonical email for the type-to-confirm step.
  // useQuery shares cache with use-billing → /me is fetched at most once.
  const { data: me } = useQuery({
    queryKey: adminKeys.me.detail(),
    queryFn:  getMeFn,
  })
  // Helpers — patch a single nested slice without callers having to spread.
  function patch<K extends keyof Settings>(
    key: K,
    value: Partial<Settings[K]>,
  ) {
    onUpdateSettings({
      [key]: { ...(settings[key] as object), ...value },
    } as Partial<Settings>)
  }

  return (
    <PageShell
      eyebrow="Account"
      title="Settings"
      sub="Workspace-wide preferences and developer integrations. Personal profile lives on the Profile page."
      sections={SECTIONS}
    >
      <PageSection
        id="appearance"
        label="Appearance"
        sub="How tucaken looks on your devices."
      >
        <AppearanceSection
          appearance={settings.appearance}
          onChange={(p) => patch('appearance', p)}
        />
      </PageSection>

      <PageSection
        id="locale"
        label="Locale & time"
        sub="Affects timestamps, dates, and number formatting across the product."
      >
        <LocaleSection
          locale={settings.locale}
          onChange={(p) => patch('locale', p)}
        />
      </PageSection>

      <PageSection
        id="resumes"
        label="Resume defaults"
        sub="Pre-applied to every new resume. You can still override per-resume."
      >
        <ResumeDefaultsSection
          defaults={settings.resumeDefaults}
          onChange={(p) => patch('resumeDefaults', p)}
        />
      </PageSection>

      <PageSection
        id="workspace"
        label="Workspace"
        sub="Shared with everyone in your org. Only owners can change these."
      >
        <WorkspaceSection
          workspace={settings.workspace}
          onChange={(p) => patch('workspace', p)}
        />
      </PageSection>

      <PageSection
        id="tokens"
        label="API tokens"
        sub="Use these to authenticate the CLI and CI integrations. Tokens are shown once on creation."
      >
        <TokensSection
          tokens={settings.apiTokens}
          onChange={(next) => onUpdateSettings({ apiTokens: next })}
        />
      </PageSection>

      <PageSection
        id="webhooks"
        label="Webhooks"
        sub="POST events to your endpoint when resumes generate or repos sync."
      >
        <WebhooksSection
          webhooks={settings.webhooks}
          onChange={(next) => onUpdateSettings({ webhooks: next })}
        />
      </PageSection>

      <PageSection
        id="data"
        label="Data & privacy"
        sub="Export everything we have on you, or wipe it."
      >
        <DataSection />
      </PageSection>

      <PageSection
        id="danger"
        label="Danger zone"
        sub="Permanent actions. 30-day grace before data is erased — restorable via support during that window."
      >
        <DangerZoneSection email={me?.email ?? ''} />
      </PageSection>
    </PageShell>
  )
}
