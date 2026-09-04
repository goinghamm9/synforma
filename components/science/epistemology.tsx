import type { ReactNode } from "react";
import { Cite, ClaimTag, Prose } from "./shell";

interface Layer {
  tag: string;
  tone: "verdant" | "amber" | "muted" | "outline";
  title: string;
  what: ReactNode;
  licenses: ReactNode;
}

const LAYERS: Layer[] = [
  {
    tag: "Empirical evidence",
    tone: "verdant",
    title: "Findings from controlled studies, in the domains where they were run",
    what: (
      <>
        Results that survived experiment and replication: forming if-then plans improves goal attainment (<Cite id="gollwitzer2006" />), monitoring
        progress promotes attainment (<Cite id="harkin2016" />), specific goals outperform vague ones (<Cite id="locke2002" />). Most of this work
        studied personal goals and health behaviors, not enterprise software.
      </>
    ),
    licenses: "An expectation that a related technique may transfer. Never a guarantee that it does.",
  },
  {
    tag: "Theoretical model",
    tone: "amber",
    title: "A structured account that organizes observations and generates predictions",
    what: (
      <>
        COM-B explains behavior as the product of capability, opportunity and motivation (<Cite id="michie2011" />); cognitive load theory explains
        why extraneous demands hurt performance (<Cite id="sweller1988" />); the levels-of-automation model describes how much of a function a
        machine should take over (<Cite id="parasuraman2000" />).
      </>
    ),
    licenses: "A vocabulary for hypotheses. Synforma's barrier taxonomy is one such vocabulary. It is not a measurement of anyone's mind.",
  },
  {
    tag: "Philosophical framework",
    tone: "muted",
    title: "A normative stance on what assistance should be",
    what: (
      <>
        Synforma&rsquo;s stance is that assistance must support autonomy and competence rather than coerce (<Cite id="ryan2000" />), and that where
        judgment is involved the person decides, not the system. Nothing empirical follows from a stance; it constrains what Synforma is allowed to
        build.
      </>
    ),
    licenses: "Design invariants: judgment steps are never automated, commits are approval-gated, every intervention explains itself.",
  },
  {
    tag: "Product hypothesis",
    tone: "outline",
    title: "The only claim Synforma actually makes when it deploys an intervention",
    what: (
      <>
        That this technique, on this step, in this application, for this population, raises completion. It is tested per program: human runs are
        assigned to control and treatment cohorts and completion is compared. Until both arms have enough runs, the interface says{" "}
        <em>Insufficient evidence</em>.
      </>
    ),
    licenses: "A decision to keep, adjust or retire the intervention, made from the program's own runs.",
  },
];

export function EpistemologyLadder() {
  return (
    <div>
      <ol className="divide-y divide-line border-y border-line">
        {LAYERS.map((layer, i) => (
          <li key={layer.tag} className="grid gap-4 py-6 sm:grid-cols-12 sm:gap-6">
            <div className="sm:col-span-4">
              <p className="mono-data text-xs text-mist">Layer {i + 1}</p>
              <div className="mt-2">
                <ClaimTag tone={layer.tone}>{layer.tag}</ClaimTag>
              </div>
            </div>
            <div className="sm:col-span-8">
              <h3 className="text-base font-medium leading-snug text-ink">{layer.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{layer.what}</p>
              <p className="mt-3 text-sm leading-relaxed text-graphite">
                <span className="font-medium text-ink">What it licenses. </span>
                {layer.licenses}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <Prose className="mt-8">
        <p>
          <strong>Why the layers matter.</strong> The evidence badge on each technique below describes the general research base of that technique in
          the literature it comes from. It says nothing about whether the technique works inside your software. Applying it to software-mediated
          work is a product hypothesis, and every program starts that hypothesis at zero evidence. A technique can carry strong evidence and still
          be retired after a program&rsquo;s own control and treatment cohorts show no difference.
        </p>
        <p>
          Two further results frame what is measured. Intentions alone explain a limited share of behavior (<Cite id="sheeran2016" />); the gap
          between an objective and what actually happens in the system of record is where Synforma&rsquo;s Intent-to-Outcome Rate lives. And
          repeated behavior in stable contexts becomes cue-driven (<Cite id="wood2016" />), which is why adoption is measured over repeated runs
          rather than a single completion, and why interventions are expected to fade rather than persist.
        </p>
      </Prose>
    </div>
  );
}
