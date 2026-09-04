import { ModeBadge, Cite, Prose } from "./shell";
import type { ExecutionMode } from "@/lib/synforma/types";

const LEVELS: { mode: ExecutionMode; who: string; synforma: string; person: string; rule: string }[] = [
  {
    mode: "guide",
    who: "The person performs every action.",
    synforma: "Acquires and analyzes: points at the control that matters, explains a requirement in the objective's own words, keeps a checklist in step with the interface.",
    person: "Selects and implements everything, including every judgment.",
    rule: "The only mode allowed on steps that need human judgment.",
  },
  {
    mode: "assist",
    who: "Synforma prepares, the person decides.",
    synforma: "Proposes and prefills values that can be derived from the entry record and defaults, and says which ones it filled and why.",
    person: "Reviews the prepared values, supplies anything that needs judgment, and moves on.",
    rule: "Judgment fields are left empty, never guessed.",
  },
  {
    mode: "act",
    who: "Synforma performs the step under authorization.",
    synforma: "Implements the actions of a step that carries no judgment content, re-grounding semantically when the interface has changed.",
    person: "Approves each commit before it happens and can stop at any point; every action is written to the audit log.",
    rule: "Commit actions are always approval-gated. Discovery never commits.",
  },
];

export function AutomationLevels() {
  return (
    <div>
      <Prose>
        <p>
          Automation is not one thing. <Cite id="parasuraman2000" /> describe it as a level chosen per function across four stages of
          processing: acquiring information, analyzing it, selecting a decision, and implementing an action. Their argument is that the right level
          depends on the consequences of error and on keeping the person able to notice and correct. Synforma&rsquo;s three modes are a coarse ladder
          over the last two stages, chosen per workflow step rather than per program.
        </p>
      </Prose>
      <div className="mt-8 divide-y divide-line border-y border-line">
        {LEVELS.map((l) => (
          <div key={l.mode} className="grid gap-4 py-6 sm:grid-cols-12 sm:gap-6">
            <div className="sm:col-span-3">
              <ModeBadge mode={l.mode} />
              <p className="mt-3 text-sm leading-snug text-ink">{l.who}</p>
            </div>
            <dl className="grid gap-3 sm:col-span-9 sm:grid-cols-2">
              <div>
                <dt className="eyebrow">Synforma</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-graphite">{l.synforma}</dd>
              </div>
              <div>
                <dt className="eyebrow">The person</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-graphite">{l.person}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="eyebrow">Invariant</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink">{l.rule}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <Prose className="mt-8">
        <p>
          The interaction around each mode follows the guidelines of <Cite id="amershi2019" />: make clear what the system can do and how well,
          show why it did what it did, and make correction cheap. In the product that is the mode rationale on every step, the &ldquo;Why
          this?&rdquo; panel on every intervention, the approval dialog before every commit, and an audit log that records who did what. A person who
          prefers to do a step alone loses nothing by declining.
        </p>
      </Prose>
    </div>
  );
}
