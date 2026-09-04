# Roadmap

## Prototype 1 — zero-configuration universal application (this build)
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
