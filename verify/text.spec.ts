/**
 * Lexical matching and requirement parsing checks (no browser). Run from synforma/:
 *   npx --yes tsx@4 verify/text.spec.ts
 * Verifies: an uppercase abbreviation matches the phrase whose initials it spells ("RLS protection" ≈
 * "Row level security") in similarity and in grounding; two-letter abbreviations ("ID") never do; a list
 * item that names an artifact called a policy is a field requirement while a prohibition is a constraint.
 */
import { acronymsIn, collapseAcronyms, similarity } from "../lib/synforma/interaction/text";
import { ground } from "../lib/synforma/interaction/grounding";
import { parseRequirements, resolveValue } from "../lib/synforma/planner/heuristic";
import type { PageModel, SemanticElement } from "../lib/synforma/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

// Acronyms
check("acronymsIn picks 3–5 letter uppercase words only", JSON.stringify(acronymsIn("RLS protection for the Table ID and SELECT")) === JSON.stringify(["rls"]), JSON.stringify(acronymsIn("RLS protection for the Table ID and SELECT")));
check("collapseAcronyms folds the spelled-out phrase", JSON.stringify(collapseAcronyms(["row", "level", "security", "enabled"], ["rls"])) === JSON.stringify(["rls", "enabled"]));
check("collapseAcronyms leaves tokens alone when the acronym is already present", JSON.stringify(collapseAcronyms(["rls", "on"], ["rls"])) === JSON.stringify(["rls", "on"]));

const sRls = similarity("Row level security enabled", "RLS protection");
check("similarity: 'Row level security enabled' vs 'RLS protection' clears the verification threshold", sRls >= 0.25, sRls.toFixed(2));
const sRlsName = similarity("Row level security", "RLS protection");
check("similarity: the renamed switch scores well against its old name", sRlsName >= 0.5, sRlsName.toFixed(2));
const sId = similarity("Invoice date within 30 days", "Table ID");
check("similarity: a two-letter 'ID' does not fold 'invoice date'", sId < 0.25, sId.toFixed(2));
const sUnrelated = similarity("Row level security enabled", "SKU protection");
check("similarity: an unrelated abbreviation does not match", sUnrelated < 0.25, sUnrelated.toFixed(2));

// Grounding by meaning on a page where the switch was renamed.
const el = (key: string, name: string, role: SemanticElement["role"], extra: Partial<SemanticElement> = {}): SemanticElement =>
  ({ key, name, role, ...extra }) as SemanticElement;
const fields = [el("f:rls", "RLS protection", "switch", { checked: false }), el("f:desc", "Description", "textarea"), el("f:name", "Table name", "textbox")];
const page = { fields, actions: [], elements: fields, definitions: [], dialogs: [], alerts: [], headings: [], heading: "Security", landmarks: [], tables: [] } as unknown as PageModel;
const hit = ground({ name: "Row level security", role: "switch", kind: "field" }, page);
check("ground: 'Row level security' lands on the 'RLS protection' switch", hit?.element.key === "f:rls", hit ? `${hit.element.name} (${hit.score.toFixed(2)}: ${hit.reasons.join(", ")})` : "no hit");

// Requirement kinds
const reqs = parseRequirements(`A correctly created table must have:
1. A table name in snake_case
2. Row level security enabled
3. A policy that allows authenticated users to read their own rows
4. Never disable row level security on existing tables
5. A description recorded for the table`);
check("parseRequirements: five list items", reqs.length === 5, String(reqs.length));
check("a policy named as an artifact to create is a field requirement", reqs[2]?.kind === "field", reqs[2]?.kind);
check("a prohibition is a policy constraint", reqs[3]?.kind === "policy", reqs[3]?.kind);
check("the other items stay field requirements", reqs.filter((r) => r.kind === "field").length === 4);

// Capped durations and options named in the objective
const capped = parseRequirements(`A correctly created project must have:
1. Data retention of 30 days or less
2. A review cycle of no more than 14 days
3. A next step scheduled within 14 days`);
check("'30 days or less' parses as a cap of 30 days", capped[0]?.expectation?.atMostDays === 30, String(capped[0]?.expectation?.atMostDays));
check("'no more than 14 days' parses as a cap of 14 days", capped[1]?.expectation?.atMostDays === 14, String(capped[1]?.expectation?.atMostDays));
check("'within 14 days' stays a date horizon, not a cap", capped[2]?.expectation?.withinDays === 14 && capped[2]?.expectation?.atMostDays === undefined);
const retention = el("f:ret", "Data retention", "combobox", { options: ["7 days", "30 days", "90 days", "Indefinite"] });
const action = { kind: "select", target: "f:ret", targetName: "Data retention", value: "{{req:r1}}", label: "Data retention ← requirement 1" } as const;
check("the option the objective names is the value chosen", resolveValue(action, capped, {}, retention) === "30 days", resolveValue(action, capped, {}, retention));
const noNamed = parseRequirements("1. Data retention of at most 60 days");
check("without a named option, the longest option within the cap is chosen", resolveValue({ ...action, value: "{{req:r1}}" }, noNamed, {}, retention) === "30 days", resolveValue({ ...action, value: "{{req:r1}}" }, noNamed, {}, retention));


// A planned button or menu item is never re-grounded to a navigation link, however many words they share.
const navEl = (key: string, name: string, role: SemanticElement["role"], extra: Partial<SemanticElement> = {}): SemanticElement => ({ key, name, role, visible: true, path: [], ...extra }) as SemanticElement;
const navActions = [navEl("link:leads", "Leads", "link", { href: "/sandbox/crm/leads" }), navEl("link:opps", "Opportunities", "link", { href: "/sandbox/crm/opportunities" }), navEl("button:actions", "Actions", "button", { popup: true, expanded: false }), navEl("link:details", "Details", "link", { href: "#" })];
const navPage: PageModel = { ...page, url: "/sandbox/crm/leads/L-1", elements: navActions, fields: [], actions: navActions };
check("a renamed menu button does not land on a navigation link that shares a word", ground({ name: "Lead tools", role: "button", kind: "action" }, navPage) === null);
check("a renamed menu item does not land on a navigation link either", ground({ name: "Convert to opportunity", role: "menuitem", kind: "action" }, navPage) === null);
check("a link the plan knew as a link still grounds to a link", ground({ name: "Lead list", role: "link", kind: "action" }, navPage)?.element.key === "link:leads");
check("a button still grounds to a button by its synonym", ground({ name: "More options", role: "button", kind: "action" }, navPage)?.element.key === "button:actions");
check("an in-page link without a destination stays a candidate for a button", ground({ name: "Show details", role: "button", kind: "action" }, navPage)?.element.key === "link:details");

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
