interface Lang { language: string; sharePct: number; repoCount: number; commitVolumeProxy: number }
interface ArcEntry { repoFullName: string; lastActiveAt: string; primaryLanguage: string | null; domain: string }

/** Top N languages by sharePct desc (stable). */
export function topLanguages(languages: Lang[] | undefined, n = 5): Lang[] {
  return [...(languages ?? [])].sort((a, b) => b.sharePct - a.sharePct).slice(0, n)
}

/** activityArc → sparkline points, original order preserved. */
export function arcPoints(arc: ArcEntry[] | undefined): Array<{ date: string; language: string | null; domain: string }> {
  return (arc ?? []).map(e => ({ date: e.lastActiveAt, language: e.primaryLanguage, domain: e.domain }))
}
