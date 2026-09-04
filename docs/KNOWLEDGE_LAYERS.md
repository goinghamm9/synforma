# Knowledge layers and the Configuration Twin — what exists today

The master specification (Appendices I and J) describes five knowledge layers and an Enterprise
Configuration Twin with three layers of truth. This maps them to the prototype honestly.

| Layer | Spec | This build | Trust state used |
|---|---|---|---|
| Live application understanding | DOM / accessibility / route state, semantic actions not selectors | `interaction/snapshot.ts` + `explorer.ts`: every screen, action, field, object and dialog observed live, addressed by role + accessible name + region | `AUTHORITATIVE_LIVE` / `OBSERVED_HIGH_CONFIDENCE` |
| Organizational context | SOPs, policies, required fields, terminology | The objective text: requirements, judgment flags, policy constraints, success definition (`planner.parseObjective`) | `ORGANIZATION_APPROVED` |
| Personal context | known workflows, preferred assistance, proficiency, time pressure | `proficiency` per step, `assistancePreference`, Get It Done, run history | private to the person |
| Product knowledge | vendor docs, release notes as structured change events | Not yet. Re-grounding events are emitted as `ui_element_changed` change events, the seed of drift detection | — |
| Native connectors / capability model | APIs, MCP, normalized capabilities | Not yet; the `Driver` interface is the seam | — |

Configuration Twin truths:
- **Vendor truth**: roadmap (documentation ingestion).
- **Tenant truth**: partially — the discovered Work Graph *is* the observed configuration of this instance
  (fields, options, required flags, menus, dialogs).
- **Operational truth**: runs and events show how people actually complete the workflow; the admin
  recommendation distinguishes learning needs from interface, policy and process problems.

Source authority hierarchy enforced in the graph builder: observed facts (`observed`/`confirmed`) are never
downgraded by inferences; inferred nodes carry `MODEL_INFERRED` and the planner that made them. Conflicts
between stated policy and observed interface are surfaced, not resolved silently (e.g. a requirement with
no matching field shows "insufficient evidence").
