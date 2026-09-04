# Roadmap

## Prototype 1 — zero authored guidance for an unfamiliar application (this build)
Done: discovery, understanding, Act with approvals, Guide with live anchors, observation, adaptation,
measurement, synthetic users, semantic self-healing across a vendor UI update, 3D Work Graph, thesis site.

Next for prototype 1:
- Cross-origin drivers for the same `Driver` interface: browser extension (content script over the
  accessibility tree), Playwright service for headless discovery and simulation at scale, API/MCP drivers
  where they exist (Salesforce, ServiceNow, Jira), and vision grounding for canvas-heavy applications.
- Server persistence (Postgres, the table map in `docs/ARCHITECTURE.md`) with org / identity / RLS.
- LLM planner hardening: evaluate the Gemini planner against the heuristic on held-out objectives and
  applications; add Claude and OpenAI providers behind `LLMProvider`.
- Discovery depth: pagination, search-driven states, role-restricted screens (log in as several roles).

## Prototype 2 — cross-application intent
"Take the new qualified lead in HubSpot, create the onboarding project in Jira, pull the contract template,
tell me what is missing." Requires: multi-application Work Graph, a capability router (which system or
agent can do which step), human approval steps inside a plan, and outcome verification across systems.

## Prototype 3 — behavioral learning at scale
Twenty people use the workflow; Synforma learns where and why they hesitate, generates interventions from
the organization's own documentation, runs cohort experiments, and reports lift. Requires: contextual
bandits or Bayesian adaptive policies replacing the explainable score (keeping "Why this?"), richer
signals (assist requests, help-center searches), and privacy controls per person.

## Platform
- Identity, permissions and policy engine: what Synforma may see, do, and commit, per person and per system.
- Simulation at scale: hundreds of synthetic runs before rollout, including permission and policy conflicts.
- Autonomous program authoring from analytics: "reps abandon step five" → intervention → cohort → deploy.
- Enterprise connectors (Microsoft 365, Google Workspace, Salesforce, Slack, Teams, ServiceNow, Workday,
  ChatGPT Enterprise, Claude, Gemini, Copilot, GitHub, Jira) as drivers and capability providers.
- Security review of the driver model (an agent that can act in enterprise software must be least-privilege,
  fully audited and interruptible).
- Evaluation harness: a suite of sandbox applications with known workflows and injected UI changes to
  measure discovery recall, grounding precision and self-healing rates on every commit.

## From the master specification (Appendices I and J)

- **Five knowledge layers**: product knowledge (vendor docs and release notes as structured change events),
  live application understanding (done for the browser), native connectors normalized into a capability
  graph, organizational context (SOP ingestion beyond the objective text), personal context (done in seed
  form: proficiency, preferences).
- **Enterprise Configuration Twin**: vendor truth, tenant truth (metadata APIs), operational truth (runs);
  versioned configuration graph; drift detection with staged promotion; shadow-process detection
  ("73% of executions leave the system"); source-authority hierarchy with trust states (seeded now).
- **Cross-computer presence**: browser extension (Chrome/Edge), desktop companion (Windows UI Automation,
  macOS Accessibility), cloud runtime, local processing of raw interaction data.
- **Transition Mode**: old route vs new route memory, bridging from old actions to the new workflow,
  Capability Value scoring per step (judgment, transferability, frequency, deskilling consequence).
- **Research track**: high-fidelity lab mode (eye tracking, mouse, keyboard metadata) to find less-invasive
  proxies; gaze stays optional and off by default; kill criteria as specified.

## The five engineering epics (seeded in this build, to be hardened)

1. **Evidence + Truth Engine** — what Synforma should believe. Seeded: claims with authority, contradictions, belief resolution, supersession by live observation, human validation. Next: SOP/document ingestion with owner/scope/authority, exception universes ("except government customers"), "why" behind every step (purpose, policy, owner), organizational memory (what changed, who, why, whether the problem still exists), cargo-cult step detection.
2. **Trust + Autonomy Engine** — what Synforma is allowed to do. Seeded: action classes, Autonomy Contract, trust decision, STOP on conflict. Next: permission + authority graph (can technically / is authorized / Synforma may / always ask), approval tokens bound to parameter hashes, human escalation graph (who owns this policy), work-type decomposition (mechanical · retrieval · transformation · decision · judgment · creative · approval · relationship).
3. **Workflow Discovery / Shadow Mode** — learn processes without a builder. Seeded: autonomous discovery, expert demonstration capture with clarification questions, semantic workflow versions with governance lifecycle. Next: silent observation period ("312 instances observed; here is what I think is happening"), owner review and approval, cross-application traces, workflow compression ("23 interactions → 4 decisions").
4. **Skill + Intervention Engine** — minimum useful assistance, progressively withdrawn. Seeded: friction states, DO_NOTHING, budget, fading, skill decay and staleness, teach-after recap, performance/recovery modes. Next: personal baselines (robust z-scores), cold-start progression (day 1 → month 1), instant corrections ("that's not why I stopped"), teach-now / teach-while / teach-after choices, workflow cost per execution.
5. **Provenance + Rollback Ledger** — every autonomous action inspectable and reversible. Seeded: ledger with before/after and undo for reversible fills. Next: compensating actions via connectors, time-range rollback ("undo 2:00–2:15"), model/version stamps, exportable audit packages.

Also from the same review: synthetic enterprise as a development laboratory; the Synforma Benchmark
(intent recognition, UI understanding, workflow reconstruction, action correctness, grounding, exception
detection, intervention quality, hallucination, permission adherence, latency, cost); AI gateway with
policy-based routing (OpenAI / Anthropic / Gemini / Azure / Bedrock / hosted / local); zero-trust
deployment; local runtime for latency and privacy; remote desktop / VDI / native surfaces; accessibility as
an opportunity; proof-of-value metrics built in (time to proficiency, interactions per workflow, assistance
dependence, error, rework, automation share, workflow cost).

The product test on the wall: after six months, is the person accomplishing more, understanding the
important parts of their work better, performing fewer meaningless interactions, depending on Synforma
less for things worth knowing and more for things never worth doing manually?
