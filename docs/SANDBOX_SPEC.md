# Meridian CRM — the sandbox target application

Meridian CRM is a fictional, deliberately generic enterprise CRM that Synforma has
"never seen". It lives at `/sandbox/crm` inside this Next.js app so the demo runs
with zero installs. It MUST contain no Synforma-specific hooks, ids, data attributes,
or imports. Synforma reads it purely through generic DOM semantics (roles, labels,
text, ARIA) the same way it would read any web application.

## Non-negotiables

1. No imports from `@/components/brand` or `@/lib/synforma`. It has its own components in
   `app/sandbox/crm/_components` and its own store in `app/sandbox/crm/_lib`.
2. Visually distinct from Synforma: a conventional corporate enterprise look (navy header,
   dense tables, standard form layouts, blue primary buttons). It should look like software
   people are made to use, not like a design showcase.
3. Uses proper semantics: `<label for>` for every field, `<button>`s, `role="dialog"` with
   an accessible title, `role="menu"/"menuitem"` for menus (Radix from `radix-ui` is fine),
   `role="tablist"/"tab"`, `aria-expanded` on collapsibles, `role="alert"` for validation errors,
   `aria-invalid` on invalid fields, `<h1>` per page, `<nav aria-label="Primary">`, `<main>`.
4. Works inside a same-origin `<iframe>`: no frame-busting, no `window.top` usage, and all
   navigation uses Next.js `<Link>` / `router.push` (client-side routing).
5. State persists in `localStorage` under the key `meridian-crm-db` (seed on first load).
   Settings page has "Reset demo data".
6. React inputs must be controlled but tolerate programmatic value setting followed by
   `input` / `change` events (standard React behavior — do nothing special).

## Two UI versions (simulated vendor release)

`app/sandbox/crm/_lib/ui-version.ts` exposes the current version ("v1" | "v2"), stored in
`localStorage` key `meridian-ui-version`, also settable via `?ui=v2` on any sandbox route
(the query param writes the setting then continues). The Settings page has a switch
"Simulate vendor UI update (v2)".

v2 changes (must all apply):
- Label "Funding stage" → "Budget confirmation"; "Decision-maker" → "Economic buyer";
  "Decision timeline" → "Purchase timeframe"; "Next step" → "Next action".
- The lead detail "Actions" dropdown becomes a kebab icon button labeled "More options"
  (aria-label) at the right of the header, and the item "Convert to opportunity" becomes
  "Create opportunity from lead".
- The "Advanced qualification" collapsible is renamed "Additional details" and is rendered
  as a tab ("Additional details") next to a "Core" tab instead of a collapsible.
- Different DOM ids/classes on all form fields (prefix `mx-` instead of `fld-`), and the
  primary nav order changes (Opportunities before Leads).
- Buttons "Next" → "Continue", "Create opportunity" → "Save opportunity".

## Data model (`app/sandbox/crm/_lib/db.ts`)

- Accounts (8): id `A-1xxx`, name, industry, region, owner.
- Contacts (~20): id, accountId, name, title, email. Each account has 2–3 contacts, at least
  one with a decision-making title (VP, Director, Chief, Head of).
- Leads (10): id `L-10xx`, company (maps to an account), contact name, source, status
  (New / Working / Nurturing), created date, owner, notes. Seed includes
  "Acme Industrial — Expansion" as lead `L-1001` with account `A-1001` "Acme Industrial".
- Opportunities (5 seeded + created ones): id `O-20xx`, name, accountId, amount, closeDate,
  stage, decisionMakerContactId, fundingStage, decisionTimeline, competitors[], nextStep,
  nextStepDate, notes, createdAt, sourceLeadId.

## Routes

- `/sandbox/crm` — Home: welcome, "My pipeline" summary cards, recent activity list, quick links.
- `/sandbox/crm/leads` — table (id, company, contact, status, source, owner, created) with a
  search box and status filter; rows link to detail.
- `/sandbox/crm/leads/[id]` — header with company name (h1), status badge, and an "Actions"
  dropdown menu (v1) containing "Convert to opportunity", "Mark as nurturing", "Assign owner"
  (the latter two open simple dialogs). Tabs: Overview (details grid), Activity (timeline),
  Files (empty state).
- `/sandbox/crm/opportunities` — table; rows link to detail.
- `/sandbox/crm/opportunities/new?lead=L-1001` — 3-step form (see below).
- `/sandbox/crm/opportunities/[id]` — detail page. Shows ALL stored fields with labels as
  definition list (`<dl>` with `<dt>` label / `<dd>` value), including Decision-maker name,
  Funding stage, Decision timeline, Competitors (comma list or "None identified"), Next step,
  Next step date. Heading is the opportunity name. A small "Created from lead L-1001" line.
- `/sandbox/crm/accounts`, `/sandbox/crm/contacts` — simple tables.
- `/sandbox/crm/reports` — a couple of static summary cards (counts computed from the db).
- `/sandbox/crm/settings` — UI version switch, Reset demo data, "About Meridian CRM v4.2".

## The multi-step opportunity form (the workflow Synforma must learn)

Wizard with a step indicator ("Step 1 of 3 · Basics", etc.). Each step is its own h2.

Step 1 — Basics
- Opportunity name (text, prefilled "<Account> — <Lead title>"), required
- Account (read-only text showing the account name)
- Amount (number, USD), required
- Expected close date (input type="date"), required
- Stage (select: Prospecting, Qualification, Proposal, Negotiation), default Prospecting
- Button "Next"

Step 2 — Qualification
- Decision-maker (select of the account's contacts; placeholder "Select a contact"), no HTML required attribute
- Funding stage (select: Unknown, Requested, Approved, Allocated), default Unknown
- Decision timeline (select: Unknown, This quarter, Next quarter, 6–12 months), default Unknown
- Collapsible "Advanced qualification" (collapsed by default, `aria-expanded`), containing:
  - Competitors (checkbox group: Northwind Systems, Contoso Cloud, Fabrikam, None identified)
  - Next step (text)
  - Next step date (text input, NOT type=date, helper text "Format: YYYY-MM-DD"; validation
    error `role="alert"` "Enter the date as YYYY-MM-DD" on Next if non-empty and malformed)
- Qualification notes (textarea)
- Buttons "Back", "Next"

Step 3 — Review
- On entering this step, a dialog "Data quality reminder" opens (role="dialog") with body
  "Opportunities missing qualification details are excluded from forecasting." and a button
  "I understand". Must be dismissed before the form is usable.
- Review summary (dl of all values), Button "Back", primary button "Create opportunity".
- On create: persist, then navigate to `/sandbox/crm/opportunities/[newId]` and show a
  dismissible success banner "Opportunity created".

Validation: step 1 required fields show `role="alert"` messages under the field and set
`aria-invalid`. Step 2 only validates the date format. Nothing else is enforced (the CRM
does not know about Synforma's five business requirements — that is the point).

## Look & feel

Navy (#1f3a5f) top bar with "Meridian CRM" text logo (no Synforma mark), white content on
a light gray (#f4f6f8) canvas, blue (#2563eb) primary buttons, gray secondary. Dense
14px UI. Left sidebar or top nav — top nav is fine. Standard enterprise, slightly dated.
Fully responsive (stack on small screens).
