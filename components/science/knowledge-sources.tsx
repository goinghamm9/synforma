import { Badge } from "@/components/ui";
import { TRUST_LABEL, TRUST_MEANING, TRUST_ORDER, TRUST_TONE } from "@/components/graph/provenance";
import { Prose } from "./shell";

export function KnowledgeSources() {
  return (
    <div>
      <Prose>
        <p>
          Every node in a Work Graph carries its provenance: the source it came from and a <strong>trust state</strong> from a fixed hierarchy.
          Live observation of the actual instance outranks configuration metadata, which outranks what the organization stated in the objective,
          which outranks vendor documentation, which outranks anything a planner inferred. Two rules hold in the graph builder. A node&rsquo;s
          status only ever moves up, from hypothesis to observed to confirmed, so an inference never downgrades an observation. And inferred
          nodes are marked as such, with the planner that made them, so they are never presented as fact. Conflicts between what the objective
          states and what the interface shows are surfaced rather than resolved silently: a requirement with no matching field is reported as
          insufficient evidence. Personal context, such as the assistance preference and per-step proficiency, is a separate layer that stays
          private to the person and never enters the graph.
        </p>
      </Prose>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm" data-testid="trust-table">
          <caption className="eyebrow mb-3 text-left">Trust states, highest authority first</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-slate">Trust state</th>
              <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-slate">Meaning</th>
              <th className="py-2 text-[11px] font-medium uppercase tracking-wider text-slate">In this build</th>
            </tr>
          </thead>
          <tbody>
            {TRUST_ORDER.map((t) => (
              <tr key={t} className="border-b border-line align-top last:border-0">
                <td className="py-3 pr-4">
                  <Badge variant={TRUST_TONE[t]}>{TRUST_LABEL[t]}</Badge>
                  <code className="mono-data mt-1.5 block text-[11px] text-mist">{t}</code>
                </td>
                <td className="py-3 pr-4 leading-relaxed text-graphite">{TRUST_MEANING[t].meaning}</td>
                <td className="py-3 leading-relaxed text-graphite">{TRUST_MEANING[t].inThisBuild}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-slate">
        The Work Graph shows this on every node under &ldquo;How Synforma knows this&rdquo;, and can highlight the inferred nodes alone.
      </p>
    </div>
  );
}
