import { Check, Minus } from "lucide-react";
import { SettingsSection } from "./section";

const REAL: { title: string; body: string }[] = [
  { title: "The engine", body: "Discovery drives the bundled application through a same-origin iframe and reads generic semantics (roles, accessible names, labels, headings). It never references DOM ids or classes, and never executes commit actions while exploring." },
  { title: "Act", body: "The inferred workflow is performed for real against the sandbox. Commits are approval-gated, every action is audited, and actions re-ground semantically when the interface changes (the sandbox ships two UI versions to prove it)." },
  { title: "Guide", body: "A person is observed on the same workflow. Hesitation, validation errors, backtracking, wrong screens and abandonment are detected from the interface, not assumed." },
  { title: "Adaptation", body: "Signals become barrier hypotheses; techniques are scored with the formula on the Science page; interventions are composed from the registry and tested against a control cohort." },
  { title: "Metrics", body: "Every number is computed from stored runs and events in this browser. Nothing is seeded or fabricated; below the minimum sample the product says so." },
];

const NOT_REAL: { title: string; body: string }[] = [
  { title: "No enterprise connectors", body: "No SSO, no CRM, HRIS or ticketing integrations. The only application Synforma can reach is the Meridian CRM sandbox bundled with this build." },
  { title: "No server persistence", body: "Everything lives in this browser's localStorage. There are no accounts, no roles, no shared data between people or devices." },
  { title: "Same-origin iframe only", body: "The interaction layer reads the DOM of a page on this origin. It cannot drive third-party websites, desktop applications or browser extensions." },
  { title: "The language model is optional and narrow", body: "Gemini, when a key is configured on the server, parses objectives, maps fields, names barriers and phrases assistance. Without it the heuristic planner does the same job deterministically. Neither can add a technique or a citation." },
  { title: "Synthetic users are simulations", body: "They exercise the engine with reduced capabilities and are labeled as such everywhere; they are excluded from human timing and cohort statistics." },
];

export function AboutSection() {
  return (
    <SettingsSection id="about" eyebrow="About this prototype" title="What is real, and what is not" lede="A demonstration of autonomous digital adoption on one bundled application. The boundaries below are stated so the demo is not mistaken for a deployment.">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="eyebrow">Real in this build</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {REAL.map((item) => (
              <li key={item.title} className="flex gap-3 py-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-verdant" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-graphite">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow">Not in this build</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {NOT_REAL.map((item) => (
              <li key={item.title} className="flex gap-3 py-3">
                <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-graphite">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SettingsSection>
  );
}
