# Demo script — the magic trick

Setup: `npm run dev`, open http://localhost:3000/demo. No API key needed. Nothing is authored, tagged or
configured for Meridian CRM anywhere in the repo.

1. **Connect.** Connect the application. Synforma shows what its interaction layer sees on the home page:
   roles, names, landmarks. No selectors.
2. **Objective.** Read the objective aloud: account executives, a properly qualified opportunity from a lead,
   five business requirements, one policy constraint. Start discovery.
3. **Discover (≈10 s).** Watch the cursor crawl the app: navigation, a menu, a three-step wizard, a collapsed
   "Advanced qualification" section that reveals six fields, a dialog. Counters and the Work Graph grow.
   Point out "Discovery never commits".
4. **Understand.** The program: population, requirements with "needs human judgment" flags, the workflow with
   Guide / Assist / Act per step and the rationale. Requirement 4 maps to a checkbox behind a disclosure;
   requirement 5 maps to a text field plus its date companion. Approve.
5. **Act.** Run it. The agent opens the lead, uses the Actions menu, fills basics, qualifies, expands the
   hidden section, acknowledges the data-quality dialog, then stops: **approval required** with the exact
   payload. Approve. Outcome verified: 5 of 5 requirements on the created record. Every action audited.
6. **Guide, fluent.** Open the employee view. Start a run. Do the first steps quickly. Synforma shows
   nothing: the friction state reads FLUENT and the decision log says DO_NOTHING.
7. **Guide, visual search.** On Qualification, look around for competitors without opening the disclosure.
   After a few seconds the state becomes VISUAL_SEARCH and one subtle cue appears anchored to "Advanced
   qualification". Open "Why this?".
8. **Guide, decision uncertainty.** On Review, hover "Create opportunity", move away, come back. Synforma does
   not highlight the button (it knows you found it). It says: "Create opportunity saves the record in this
   system only. Nothing is sent to the customer."
9. **Get It Done.** Start another run, choose "Just do it" or press Get It Done. Synforma fills the routine
   fields, leaves the judgment fields to you, and stops at approval.
10. **Second run, less help.** Complete a run unassisted; the proficiency panel shows the level and the next
    run's decisions favor DO_NOTHING.
11. **Vendor UI update.** In Mission Control flip "Simulate vendor UI update" (or open the CRM settings). Labels
    rename, the menu becomes a kebab, the collapsible becomes a tab, ids change. Run Act again: the log shows
    six semantic re-groundings and 5 of 5 requirements verified. Nothing was re-configured.
12. **Admin insight.** Measure: the recommendation reads which step carries the friction and what would not
    help ("Additional navigation training is unlikely to help"). Intent-to-Outcome Rate shows "Still learning"
    until five runs exist; run the synthetic users to see it fill in, labeled as simulation.

The reaction to aim for: *You didn't configure this? No. You didn't build the walkthrough? No. You didn't tag
the UI? No. It figured out the workflow itself? Yes.*
