"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@/components/ui";
import { LEVEL_LABEL, SKILL_LABEL, skillStatus } from "@/lib/synforma/engine/proficiency";
import { useSynforma } from "@/lib/synforma/store";
import type { AssistanceLevel, Program, SkillStatus } from "@/lib/synforma/types";

const LEVEL_TONE: Record<AssistanceLevel, "default" | "outline" | "muted" | "verdant"> = {
  do_with_me: "default",
  guide: "outline",
  explain: "muted",
  observe: "verdant",
};

const SKILL_TONE: Record<SkillStatus, string> = {
  unknown: "text-mist",
  learning: "text-graphite",
  mastered: "text-verdant",
  stale: "text-amber",
};

/** A timestamp captured after mount, so skill decay is never evaluated with a clock read during render. */
function useMountedNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);
  return now;
}

interface IndependenceListProps {
  program: Program;
  onOverride: (stepId: string, level: AssistanceLevel) => void;
}

/**
 * "Your independence": per step, the assistance level Synforma will start
 * from and how it got there. Private to the person; overridable either way.
 */
export function IndependenceList({ program, onOverride }: IndependenceListProps) {
  const proficiency = useSynforma((s) => s.proficiency);
  const now = useMountedNow();
  const steps = program.workflow?.steps ?? [];
  const version = program.workflow?.version;
  const anyRecord = steps.some((s) => Boolean(proficiency[`${program.id}/${s.id}`]));
  return (
    <div data-testid="independence-list" data-recorded={anyRecord}>
      <ul className="divide-y divide-line rounded-md border border-line bg-surface">
        {steps.map((step) => {
          const p = proficiency[`${program.id}/${step.id}`];
          const level: AssistanceLevel = p?.assistanceLevel ?? "guide";
          const skill = skillStatus(p, version, now ?? p?.updatedAt ?? 0);
          return (
            <li key={step.id} className="px-2.5 py-2 text-[12px]" data-testid="independence-entry" data-step-id={step.id} data-level={level} data-skill={skill.status}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 flex-1 truncate text-ink">{step.title}</span>
                <Badge variant={LEVEL_TONE[level]} data-testid="independence-level">
                  {LEVEL_LABEL[level]}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate">
                <span className={SKILL_TONE[skill.status]} title={skill.reason} data-testid="independence-skill">
                  {SKILL_LABEL[skill.status]}
                </span>
                <span aria-hidden="true">·</span>
                {p ? (
                  <span className="mono-data" data-testid="independence-unassisted">
                    {p.unassistedSuccesses} unassisted success{p.unassistedSuccesses === 1 ? "" : "es"}
                    {p.assistedRuns ? ` · ${p.assistedRuns} with help` : ""}
                  </span>
                ) : (
                  <span>Not attempted yet</span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-graphite" disabled={level === "guide"} onClick={() => onOverride(step.id, "guide")} data-testid="teach-me-anyway">
                    Teach me anyway
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-graphite" disabled={level === "do_with_me"} onClick={() => onOverride(step.id, "do_with_me")} data-testid="keep-handling">
                    Keep handling this
                  </Button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-slate">
        {anyRecord ? "Guidance fades after three unassisted successes with a low error rate; two error runs in five bring it back." : "Every step starts at Guide. Synforma records proficiency after each finished run; nothing is assumed before then."}{" "}
        Private to you ·{" "}
        <Link href="/settings#independence" className="underline underline-offset-2 hover:text-ink">
          Settings
        </Link>
      </p>
    </div>
  );
}
