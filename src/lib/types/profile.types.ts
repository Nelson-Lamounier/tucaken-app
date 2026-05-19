/** Recursive JSON-serialisable value — used for rollup whose schema is TBD. */
type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface MirrorJson { readonly paragraph: string }
export interface RevealItem { readonly insight: string; readonly evidence: string }
export interface RevealJson { readonly reveals: RevealItem[] }
export interface ProfileSummary {
  readonly rollup: JsonValue
  readonly mirror: MirrorJson | null
  readonly reveal: RevealJson | null
  readonly refreshedAt: string | null
  readonly synthesisRefreshedAt: string | null
}
