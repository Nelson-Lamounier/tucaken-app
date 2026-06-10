/**
 * @format
 * Project references — rank a user's documented projects against interview-stage
 * topics (the Research Agent's verified/partial/gap skills), so the UI's
 * "Your project reference sheet" can deep-link the most relevant case-studies.
 *
 * Deterministic, rule-based (no embeddings): a project matches a skill when the
 * skill appears (whole-token / phrase) in the project's tech stack, tags, name,
 * or tagline. Scored stack-first, tie-broken by recency. RLS-scoped — the caller
 * runs inside withUser(), so the queries see only the user's own projects.
 */
import type { Queryable } from '../pg.js';

export interface ProjectReferenceDto {
  readonly id:         string;
  readonly title:      string;
  readonly pitch:      string;
  readonly highlights: readonly string[];
}

interface ProjectRow {
  readonly id:             string;
  readonly name:           string;
  readonly tagline:        string | null;
  readonly pitch:          string | null;
  readonly lastActivityAt: string | null;
}

export interface ProjectRefIndex {
  readonly projects:       readonly ProjectRow[];
  readonly stackByProject: ReadonlyMap<string, readonly string[]>;
  readonly tagsByProject:  ReadonlyMap<string, readonly string[]>;
}

const MAX_REFS_PER_SKILL = 3;
const MAX_HIGHLIGHTS = 4;

/** Load the user's projects + stack + tags (RLS-scoped). */
export async function loadProjectRefIndex(db: Queryable): Promise<ProjectRefIndex> {
  const [projects, stack, tags] = await Promise.all([
    db.query<ProjectRow>(
      `SELECT id, name, tagline, pitch, last_activity_at AS "lastActivityAt" FROM projects`,
    ),
    db.query<{ project_id: string; name: string }>(
      `SELECT project_id, name FROM project_stack_items`,
    ),
    db.query<{ project_id: string; tag: string }>(
      `SELECT project_id, tag FROM project_tags`,
    ),
  ]);
  return {
    projects:       projects.rows,
    stackByProject: groupValues(stack.rows, (r) => r.project_id, (r) => r.name),
    tagsByProject:  groupValues(tags.rows, (r) => r.project_id, (r) => r.tag),
  };
}

/**
 * Rank projects for each skill. Returns a map keyed by lowercased skill →
 * top-N ProjectReferenceDto, ordered by match score then recency. Skills with
 * no project match are omitted (UI falls back to its placeholder).
 */
export function rankProjectsForSkills(
  index: ProjectRefIndex,
  skills: readonly string[],
): Record<string, ProjectReferenceDto[]> {
  const out: Record<string, ProjectReferenceDto[]> = {};
  const seen = new Set<string>();

  for (const raw of skills) {
    const skill = raw.trim().toLowerCase();
    if (skill.length < 2 || seen.has(skill)) continue;
    seen.add(skill);

    const scored = index.projects
      .map((p) => scoreProject(p, skill, index))
      .filter((s) => s.score > 0)
      .sort(byScoreThenRecency);

    if (scored.length > 0) {
      out[skill] = scored.slice(0, MAX_REFS_PER_SKILL).map((s) => s.ref);
    }
  }
  return out;
}

interface Scored { readonly ref: ProjectReferenceDto; readonly score: number; readonly recency: number }

function scoreProject(p: ProjectRow, skill: string, index: ProjectRefIndex): Scored {
  const skillTokens = tokenize(skill);
  const stack = index.stackByProject.get(p.id) ?? [];
  const tags = index.tagsByProject.get(p.id) ?? [];

  const stackHits = stack.filter((s) => matches(skill, skillTokens, s));
  const tagHits = tags.filter((t) => matches(skill, skillTokens, t));
  const nameHit = matches(skill, skillTokens, p.name) || matches(skill, skillTokens, p.tagline ?? '');

  const score = stackHits.length * 2 + tagHits.length + (nameHit ? 1 : 0);
  const highlights = dedupe([...stackHits, ...tagHits]).slice(0, MAX_HIGHLIGHTS);

  return {
    score,
    recency: p.lastActivityAt ? Date.parse(p.lastActivityAt) : 0,
    ref: {
      id:         p.id,
      title:      p.name,
      pitch:      firstSentence(p.pitch ?? p.tagline ?? ''),
      highlights,
    },
  };
}

function byScoreThenRecency(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score;
  return b.recency - a.recency;
}

/** A candidate (stack item / tag / name) matches a skill on whole-token or phrase. */
function matches(skill: string, skillTokens: readonly string[], candidateRaw: string): boolean {
  const candidate = candidateRaw.trim().toLowerCase();
  if (candidate.length === 0) return false;
  if (skillTokens.length > 1) {
    // Multi-word skill: phrase contained, or every token present as a candidate token.
    if (candidate.includes(skill)) return true;
    const candTokens = new Set(tokenize(candidate));
    return skillTokens.every((t) => candTokens.has(t));
  }
  // Single-token skill: must equal one of the candidate's tokens (avoids "go" ⋈ "mongodb").
  const first = skillTokens[0];
  return first !== undefined && tokenize(candidate).includes(first);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '';
  const dot = trimmed.indexOf('. ');
  const sentence = dot === -1 ? trimmed : trimmed.slice(0, dot + 1);
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
}

function dedupe(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function groupValues<T>(
  rows: readonly T[],
  key: (t: T) => string,
  value: (t: T) => string,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const k = key(row);
    const arr = map.get(k);
    if (arr) arr.push(value(row));
    else map.set(k, [value(row)]);
  }
  return map;
}
