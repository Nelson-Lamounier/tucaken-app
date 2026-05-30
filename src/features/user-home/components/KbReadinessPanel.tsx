/** @format */

"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { DiagnosticJson } from "@/lib/types/profile.types";
import { tierOf, TIER_TEXT, TIER_BAR } from "../lib/tier";

const COMPONENT_LABEL: Readonly<Record<string, string>> = {
  profileDepth: "Profile depth",
  ragDepth: "RAG depth",
  directionConfidence: "Direction",
  reconciliationAlignment: "Reconciliation",
  resumeCoverage: "Resume coverage",
};

const EASE = [0.22, 1, 0.36, 1] as const;

interface KbReadinessPanelProps {
  readonly diagnostic: DiagnosticJson | null;
  /** When true: no Card chrome and tighter spacing, for embedding inside another
   *  panel (e.g. the readiness gauge card). */
  readonly embedded?: boolean;
}

export function KbReadinessPanel({
  diagnostic,
  embedded = false,
}: KbReadinessPanelProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (!diagnostic) {
    if (embedded) return null;
    return (
      <Card
        as="section"
        className="flex h-full flex-col overflow-hidden"
      >
        <h3 className="border-b border-zinc-200 px-6 py-4 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:border-white/5">
          At a glance
        </h3>
        <p className="px-6 py-6 text-sm text-zinc-500">
          Your readiness diagnostic is still being generated.
        </p>
      </Card>
    );
  }

  const rowPad = embedded ? "px-0 py-2" : "px-6 py-3";
  const blockerPad = embedded ? "px-0" : "px-6";
  const labelSize = embedded ? "text-[11px]" : "text-sm";
  const scoreSize = embedded ? "text-[11px]" : "text-sm";
  const blockerSize = embedded ? "text-[11px]" : "text-xs";

  const body = (
    <>
      <h3
        className={cn(
          "font-medium uppercase tracking-wider text-zinc-500",
          embedded
            ? "pb-1 text-[10px]"
            : "border-b border-zinc-200 px-6 py-4 text-[11px] dark:border-white/5",
        )}
      >
        At a glance
      </h3>
      <dl
        className={cn(
          "flex flex-col divide-y divide-zinc-200 dark:divide-white/5",
          !embedded && "flex-1",
        )}
      >
        {Object.entries(diagnostic.components).map(([key, comp]) => {
          const tier = tierOf(comp.score);
          const label = COMPONENT_LABEL[key] ?? key;
          const hasBlockers = comp.blockers.length > 0;
          const isOpen = openKey === key;
          const fill = Math.max(0.02, Math.min(1, comp.score / 100));

          return (
            <div key={key}>
              <button
                type="button"
                disabled={!hasBlockers}
                aria-expanded={isOpen}
                onClick={() =>
                  setOpenKey((prev) => (prev === key ? null : key))
                }
                className={cn(
                  "flex w-full flex-col gap-1 text-left transition-colors disabled:cursor-default",
                  rowPad,
                  hasBlockers &&
                    (embedded
                      ? "enabled:hover:opacity-80"
                      : "enabled:hover:bg-zinc-50 dark:enabled:hover:bg-white/2"),
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-400",
                      labelSize,
                    )}
                  >
                    {label}
                    {hasBlockers && (
                      <ChevronDownIcon
                        className={`size-3.5 text-zinc-400 transition-transform dark:text-zinc-500 ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="flex items-baseline gap-2">
                    {hasBlockers && !embedded && (
                      <span className="text-[10px] text-zinc-500">
                        {comp.blockers.length} issue
                        {comp.blockers.length === 1 ? "" : "s"}
                      </span>
                    )}
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        scoreSize,
                        TIER_TEXT[tier],
                      )}
                    >
                      {comp.score}%
                    </span>
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5">
                  <motion.div
                    className={`h-full w-full rounded-full ${TIER_BAR[tier]}`}
                    style={{ transformOrigin: "left", willChange: "transform" }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: fill }}
                    transition={{ duration: 0.6, ease: EASE }}
                  />
                </div>
              </button>

              {isOpen && hasBlockers && (
                <div
                  className={cn(
                    "pb-3 pt-1",
                    blockerPad,
                    !embedded && "bg-zinc-50 dark:bg-zinc-950/40",
                  )}
                >
                  <ul className={cn("space-y-1.5 leading-relaxed text-zinc-600 dark:text-zinc-300", blockerSize)}>
                    {comp.blockers.map((blocker) => (
                      <li
                        key={`${key}-${blocker}`}
                        className="flex gap-2"
                      >
                        <span
                          className="mt-1.5 size-1 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-500"
                          aria-hidden
                        />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </dl>
    </>
  );

  if (embedded) return <div className="flex flex-col">{body}</div>;
  return (
    <Card
      as="section"
      className="flex h-full flex-col overflow-hidden"
    >
      {body}
    </Card>
  );
}
