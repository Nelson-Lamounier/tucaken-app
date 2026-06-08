'use client'

import { useKbHealth } from '../hooks/use-kb-health'
import { KnowledgeBaseHealthPanel } from '@/components/kb/KnowledgeBaseHealthPanel'

/** Connected KB data-health panel — fetches composition and renders the panel. */
export function KbHealthPanel({ className }: { readonly className?: string }) {
  const { data, isLoading } = useKbHealth()
  return <KnowledgeBaseHealthPanel kb={data} loading={isLoading} className={className} />
}
