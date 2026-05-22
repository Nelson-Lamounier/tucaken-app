import {
  PROJECT_ROLE_LABELS,
  PROJECT_TYPE_LABELS,
  RESUME_ANGLE_LABELS,
  STACK_CATEGORY_LABELS,
  type StackCategory,
} from '../../lib/types'
import type { PublicCaseStudy as PublicCaseStudyData } from '../../lib/public-types'
import { ArchitectureDiagram } from '../ArchitectureDiagram'

const CATEGORY_ORDER: StackCategory[] = [
  'language', 'framework', 'database', 'infrastructure',
  'observability', 'ci_cd', 'external_service',
]

export function PublicCaseStudy({ data }: { readonly data: PublicCaseStudyData }) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {data.name}
        </h1>
        {data.tagline && (
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{data.tagline}</p>
        )}
        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500 dark:text-zinc-500">
          <Meta label="Type" value={PROJECT_TYPE_LABELS[data.type] ?? data.type} />
          <Meta label="Role" value={PROJECT_ROLE_LABELS[data.roleExhibited] ?? data.roleExhibited} />
          {data.tags.length > 0 && <Meta label="Tags" value={data.tags.join(', ')} />}
        </dl>
      </header>

      {data.pitch && (
        <section className="mt-10">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            {data.pitch}
          </p>
        </section>
      )}

      {data.stack.length > 0 && (
        <Block title="Stack">
          <div className="space-y-4">
            {CATEGORY_ORDER.map((cat) => {
              const subset = data.stack.filter((s) => s.category === cat)
              if (subset.length === 0) return null
              return (
                <div key={cat}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {STACK_CATEGORY_LABELS[cat] ?? cat}
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {subset.map((s) => (
                      <li
                        key={s.name}
                        className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-200"
                      >
                        {s.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Block>
      )}

      {data.architecture && data.architecture.diagram_source && (
        <Block title="Architecture">
          <ArchitectureDiagram
            format={data.architecture.diagram_format}
            source={data.architecture.diagram_source}
          />
        </Block>
      )}

      {data.highlights.length > 0 && (
        <Block title="Highlights">
          <ul className="space-y-4">
            {data.highlights.map((h, i) => (
              <li key={i}>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{h.title}</p>
                {h.description && (
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{h.description}</p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.challenges.length > 0 && (
        <Block title="Challenges">
          <ol className="space-y-4">
            {data.challenges.map((c, i) => (
              <li key={i}>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{c.problem}</p>
                {c.solution && (
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Solution: </span>
                    {c.solution}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Block>
      )}

      {data.decisions.length > 0 && (
        <Block title="Key decisions">
          <ol className="space-y-5">
            {data.decisions.map((d, i) => (
              <li key={i} className="border-l-2 border-zinc-200 pl-4 dark:border-white/10">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{d.title}</p>
                {d.context && <DecisionLine label="Context" value={d.context} />}
                {d.decision && <DecisionLine label="Decision" value={d.decision} />}
                {d.consequences && <DecisionLine label="Consequences" value={d.consequences} />}
              </li>
            ))}
          </ol>
        </Block>
      )}

      {data.resumeBullets.length > 0 && (
        <Block title="Resume bullets">
          <div className="space-y-4">
            {data.resumeBullets.map((rb) => (
              <div key={rb.angle}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {RESUME_ANGLE_LABELS[rb.angle] ?? rb.angle}
                </h3>
                <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                  {rb.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-teal-500" aria-hidden />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Block>
      )}

      <footer className="mt-16 border-t border-zinc-200 pt-6 text-center dark:border-white/10">
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          Generated by Tucaken from real GitHub evidence
        </p>
      </footer>
    </article>
  )
}

function Meta({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">{label}</dt>
      <dd className="mt-0.5 text-zinc-700 dark:text-zinc-300">{value}</dd>
    </div>
  )
}

function Block({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  )
}

function DecisionLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{label}: </span>
      {value}
    </p>
  )
}
