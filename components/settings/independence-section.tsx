"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Badge, Button } from "@/components/ui";
import { LEVEL_LABEL, LEVEL_ORDER } from "@/lib/synforma/engine/proficiency";
import { useSynforma } from "@/lib/synforma/store";
import type { AssistanceLevel, ProficiencyState } from "@/lib/synforma/types";
import { FieldRow, SettingsSection, StatusLine } from "./section";

const LEVEL_TONE: Record<AssistanceLevel, "default" | "outline" | "muted" | "verdant"> = {
  do_with_me: "default",
  guide: "outline",
  explain: "muted",
  observe: "verdant",
};

interface Entry {
  state: ProficiencyState;
  title: string;
}

interface Group {
  programId: string;
  title: string;
  entries: Entry[];
}

export function IndependenceSection() {
  const proficiency = useSynforma((s) => s.proficiency);
  const programs = useSynforma((s) => s.programs);
  const setProficiency = useSynforma((s) => s.setProficiency);

  const groups = useMemo<Group[]>(() => {
    const byProgram = new Map<string, ProficiencyState[]>();
    for (const p of Object.values(proficiency)) {
      const list = byProgram.get(p.programId) ?? [];
      list.push(p);
      byProgram.set(p.programId, list);
    }
    return [...byProgram.entries()]
      .map(([programId, states]) => {
        const program = programs[programId];
        const steps = program?.workflow?.steps ?? [];
        const order = new Map(steps.map((s, i) => [s.id, i] as const));
        const entries = states
          .slice()
          .sort((a, b) => (order.get(a.stepId) ?? 999) - (order.get(b.stepId) ?? 999) || a.stepId.localeCompare(b.stepId))
          .map((state) => ({ state, title: steps.find((s) => s.id === state.stepId)?.title ?? state.stepId }));
        return { programId, title: program?.title ?? "Deleted program", entries };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [proficiency, programs]);

  const override = (state: ProficiencyState, assistanceLevel: AssistanceLevel) => setProficiency({ ...state, assistanceLevel, updatedAt: Date.now() });

  return (
    <SettingsSection
      id="independence"
      eyebrow="Your independence"
      title="Your independence"
      lede="Per step, Synforma counts runs you completed with and without help and whether recent runs produced errors. After three unassisted successes with a low error rate, guidance fades one level; two error runs in five bring it back. You can move it yourself here at any time. Private to you."
    >
      <FieldRow
        label="Assistance ladder"
        hint={
          <>
            {LEVEL_ORDER.map((l) => LEVEL_LABEL[l]).join(" → ")}. Every step starts at Guide.{" "}
            <Link href="/science#fading" className="text-graphite underline decoration-line-strong underline-offset-[3px] hover:text-ink">
              How fading is decided
            </Link>
            .
          </>
        }
      >
        {groups.length ? (
          <div className="space-y-5" data-testid="independence-list">
            {groups.map((g) => (
              <div key={g.programId}>
                <p className="truncate text-sm font-medium text-ink">{g.title}</p>
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
                  {g.entries.map(({ state, title }) => {
                    const errorRuns = state.errorHistory.filter(Boolean).length;
                    return (
                      <li key={state.stepId} className="p-3.5" data-testid="independence-entry" data-step-id={state.stepId} data-level={state.assistanceLevel}>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                          <p className="min-w-0 flex-1 truncate text-sm text-ink">{title}</p>
                          <Badge variant={LEVEL_TONE[state.assistanceLevel]} data-testid="independence-level">
                            {LEVEL_LABEL[state.assistanceLevel]}
                          </Badge>
                        </div>
                        <p className="mono-data mt-1 text-[12px] text-slate">
                          {state.unassistedSuccesses} unassisted success{state.unassistedSuccesses === 1 ? "" : "es"} since the last fade · {state.assistedRuns} assisted run
                          {state.assistedRuns === 1 ? "" : "s"} · errors in {errorRuns} of the last {state.errorHistory.length}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" disabled={state.assistanceLevel === "guide"} onClick={() => override(state, "guide")} data-testid="teach-me-anyway">
                            Teach me anyway
                          </Button>
                          <Button variant="outline" size="sm" disabled={state.assistanceLevel === "do_with_me"} onClick={() => override(state, "do_with_me")} data-testid="keep-handling">
                            Keep handling this
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-slate" data-testid="independence-empty">
            No proficiency recorded yet. Synforma records it per step after each finished Guide session; nothing is assumed before then.
          </div>
        )}
        <StatusLine>
          Teach me anyway returns a step to Guide. Keep handling this sets it to Do with me. Either takes effect on the next run; fading resumes
          from there.
        </StatusLine>
      </FieldRow>
    </SettingsSection>
  );
}
