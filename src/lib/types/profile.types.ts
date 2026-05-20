/** Recursive JSON-serialisable value — used for rollup whose schema is TBD. */
type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface MirrorJson { readonly paragraph: string }
export interface RevealItem { readonly insight: string; readonly evidence: string }
export interface RevealJson { readonly reveals: RevealItem[] }
export interface ArchetypeFit { readonly archetype: string; readonly fit: 'strong' | 'moderate' | 'weak'; readonly rationale: string }
export interface SeniorityCall { readonly area: string; readonly level: string; readonly evidence: string }
export interface DirectionJson { readonly archetypes: ArchetypeFit[]; readonly seniority: SeniorityCall[]; readonly whatToDeepen: string[] }
export interface UnsupportedClaim { readonly claim: string; readonly resumeRef: string; readonly whyUnsupported: string }
export interface UndersoldStrength { readonly evidence: string; readonly rollupDimension: string; readonly suggestion: string }
export interface ReconciliationJson { readonly unsupportedClaims: UnsupportedClaim[]; readonly undersold: UndersoldStrength[] }
export interface ProfileSummary {
  readonly rollup: JsonValue
  readonly mirror: MirrorJson | null
  readonly reveal: RevealJson | null
  readonly direction: DirectionJson | null
  readonly reconciliation: ReconciliationJson | null
  readonly refreshedAt: string | null
  readonly synthesisRefreshedAt: string | null
}
