import type { DiscoveredState } from "../engine/explorer";
import { ground, keywordsOf } from "../interaction/grounding";
import { similarity, tokenize } from "../interaction/text";
import { generalizeRoute } from "../interaction/snapshot";
import { nodeId, upsertEdge, upsertNode } from "../graph/work-graph";
import type {
  Action,
  BarrierType,
  ExecutionMode,
  ParsedObjective,
  Requirement,
  SemanticAnchor,
  SemanticElement,
  Workflow,
  WorkflowStep,
} from "../types";
import type {

  AssistanceContent,
  ComposeAssistanceInput,
  DiagnoseInput,
  DiagnoseOutput,
  InferWorkflowInput,
  ParseObjectiveInput,
  Planner,
} from "./types";

/** Verbs that end a form. Row-level destructive controls ("Remove column 2", "Delete line") are commits but never the workflow's outcome. */
const TERMINAL_COMMIT_RE = /^(create|submit|save|issue|confirm|order|place|send|approve|publish|finish|complete|done|book|pay|apply|generate|add)\b/i;
const ROW_LEVEL_RE = /\b(line|row|column|item)\b\s*\d*$|^(remove|delete|clear|reset|wipe)\b/i;

/** The button that ends a form on this screen, if any: a terminal verb first, else any commit that is not a row-level control. */
export function terminalCommit(actions: SemanticElement[], parsed?: ParsedObjective): SemanticElement | undefined {
  const commits = actions.filter((a) => a.role === "button" && a.commit && !a.inDialog && !a.disabled);
  const destructiveObjective = parsed ? /\b(delete|remove|archive|cancel)\b/i.test(parsed.targetBehavior ?? parsed.title ?? "") : false;
  return (
    commits.find((a) => TERMINAL_COMMIT_RE.test(a.name) && !ROW_LEVEL_RE.test(a.name)) ??
    commits.find((a) => !ROW_LEVEL_RE.test(a.name)) ??
    (destructiveObjective ? commits[0] : undefined)
  );
}

/** Acknowledgement boxes a person must tick before a commit ("I confirm…", "I understand…", policy declarations). */
export const CONSENT_RE = /\b(confirm|understand|agree|acknowledg|policy|declar|certif|attest|not split|accept)/i;

/** The object a route names, singular, from the segment before ":id" ("/payments/:id" → "payment"). */
export function routeNoun(route: string): string | undefined {
  const parts = route.split("/").filter(Boolean);
  const i = parts.indexOf(":id");
  const seg = i > 0 ? parts[i - 1] : parts[parts.length - 1];
  if (!seg || seg.startsWith(":")) return undefined;
  const words = seg.replace(/[-_]+/g, " ").toLowerCase();
  return words.replace(/ies$/, "y").replace(/(s)es$/, "$1").replace(/([^s])s$/, "$1");
}

/**
 * HeuristicPlanner — deterministic reasoning without any LLM.
 *
 * It is deliberately transparent: lexical similarity with a small enterprise
 * synonym lexicon, structural rules over the discovered states, and explicit
 * rules for Guide / Assist / Act. When Synforma runs without an API key this
 * is what makes decisions, and the UI says so.
 */

const NEXT_RE = /^(next|continue|proceed)\b/i;
const DISMISS_RE = /^(i understand|got it|ok|okay|close|dismiss|acknowledge|continue|done)\b/i;
const JUDGMENT_RE = /\b(decision[- ]?maker|economic buyer|buyer|stakeholder|champion|sponsor|budget|funding|verify|verified|review|judg|assess|approve|approval|accurate|appropriate|confirm)\b/i;
const POPULATION_RE = /\b(account executives?|sales reps?|reps?|employees?|recruiters?|managers?|analysts?|agents?|team members?|users?|staff|engineers?|sellers?|support agents?|customer success managers?)\b/i;
const OBJECT_RE = /\b(?:create|creating|submit|submitting|open|log|file|register|record|complete|book|raise)\s+(?:an?\s+|the\s+)?(?:[\w-]+\s+){0,3}?(opportunity|opportunities|expense report|expense|ticket|case|lead|request|order|invoice|record|entry|account|contact|project|task|report|deal)\b/i;
const ENTRY_RE = /\bfrom\s+(?:an?\s+|the\s+)?(?:[\w-]+\s+){0,2}?(lead|prospect|inquiry|ticket|email|request|case|record)\b/i;

function sentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function isoDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export function parseRequirements(text: string): Requirement[] {
  const items: string[] = [];
  const listRe = /^\s*(?:\(?\d+[.)]|[-•*])\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = listRe.exec(text))) items.push(m[1]);
  if (!items.length) {
    // Inline "(1) ... (2) ..." or sentences with obligation verbs.
    const inline = text.split(/\(\d+\)\s*/).slice(1).map((s) => s.replace(/[,;.]\s*$/, "").trim());
    if (inline.length) items.push(...inline);
    else {
      for (const s of sentences(text)) {
        if (/\b(must|need|needs|require|required|should|at least|record|confirm)\b/i.test(s) && !/\b(want|goal)\b/i.test(s)) items.push(s);
      }
    }
  }
  return items.map((raw, i) => {
    const text = raw.replace(/\s+/g, " ").trim();
    const paren = /\(([^)]+)\)/.exec(text);
    const quoted = Array.from(text.matchAll(/['"“‘]([^'"”’]+)['"”’]/g)).map((q) => q[1]);
    let acceptedValues: string[] | undefined;
    let rejectedValues: string[] | undefined;
    if (paren) {
      const inner = paren[1];
      const notMatch = /^not\s+(.+)$/i.exec(inner);
      if (notMatch) rejectedValues = notMatch[1].split(/\s*(?:,|or)\s*/i).map((v) => v.trim()).filter(Boolean);
      else if (/\bor\b|,/.test(inner)) acceptedValues = inner.split(/\s*(?:,|or)\s*/i).map((v) => v.trim()).filter(Boolean);
    }
    if (quoted.length) acceptedValues = [...(acceptedValues ?? []), ...quoted];
    const within = /within\s+(\d+)\s+days?/i.exec(text);
    const atLeast = /at least\s+(\d+)\s+days?/i.exec(text);
    const fieldHint = text.replace(/\([^)]*\)/g, "").replace(/\b(a|an|the|named|at least one|recorded|scheduled|set|must|be|is|has|have|or|of)\b/gi, " ").replace(/\s+/g, " ").trim();
    // A constraint is phrased as a prohibition. A list item that names something to create ("A policy that allows …")
    // is a field requirement even when the artifact is called a policy.
    const kind: Requirement["kind"] = /\b(without|never|must not|do not|don't|restricted|confidential|prohibited|not allowed)\b/i.test(text) ? "policy" : /\b(adoption|% |percent|sustained)\b/i.test(text) ? "outcome" : "field";
    return {
      id: `r${i + 1}`,
      text,
      kind,
      keywords: keywordsOf(text),
      judgment: JUDGMENT_RE.test(text),
      expectation: {
        fieldHint: fieldHint || text,
        acceptedValues,
        rejectedValues,
        withinDays: within ? Number(within[1]) : undefined,
        atLeastDays: atLeast ? Number(atLeast[1]) : undefined,
      },
    };
  });
}

/** Split a context key or a label into lowercase word tokens ("customerNote" → ["customer", "note"]). */
function wordTokens(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !/^(the|a|an|to|of|for|and|or|in|on|at|by)$/.test(t));
}

/**
 * The work-context value that belongs to a field, by meaning rather than by an
 * exact key: every token of the context key must appear in the field's name or
 * in the requirement's hint ("customerNote" ↔ "Note to customer",
 * "deliveryDate" ↔ "Requested delivery date"). Ties go to the key that
 * explains more of the name. `entryUrl` never fills a field.
 */
export function contextValueFor(context: Record<string, string>, hints: (string | undefined)[]): string | undefined {
  const nameTokens = new Set(hints.filter((h): h is string => Boolean(h)).flatMap(wordTokens));
  if (!nameTokens.size) return undefined;
  let best: { key: string; matched: number; score: number } | null = null;
  for (const [key, value] of Object.entries(context)) {
    if (!value || key === "entryUrl" || key.includes(":")) continue;
    const keyTokens = wordTokens(key);
    if (!keyTokens.length) continue;
    const matched = keyTokens.filter((t) => nameTokens.has(t) || [...nameTokens].some((n) => n.startsWith(t) || t.startsWith(n))).length;
    const score = matched / keyTokens.length;
    if (score < 0.6) continue;
    if (!best || score > best.score || (score === best.score && matched > best.matched)) best = { key, matched, score };
  }
  return best ? context[best.key] : undefined;
}

export class HeuristicPlanner implements Planner {
  readonly kind = "heuristic" as const;

  async parseObjective({ objectiveText, appName }: ParseObjectiveInput): Promise<ParsedObjective> {
    const text = objectiveText.trim();
    const sents = sentences(text);
    const requirements = parseRequirements(text).filter((r) => r.kind !== "outcome");
    const popMatch = POPULATION_RE.exec(text);
    const population = popMatch ? capitalize(popMatch[1].toLowerCase()) : "Employees";
    const objMatch = OBJECT_RE.exec(text);
    const objectHint = objMatch ? objMatch[1].toLowerCase().replace(/ies$/, "y") : "";
    const entryMatch = ENTRY_RE.exec(text);
    const entryHint = entryMatch ? entryMatch[1].toLowerCase() : "";
    const behaviorSentence = sents.find((s) => OBJECT_RE.test(s)) ?? sents[0] ?? text;
    const targetBehavior = behaviorSentence
      .replace(/^(i|we)\s+(want|need|would like)\s+(our\s+)?[\w\s]*?\bto\s+/i, "")
      .replace(/\s+in this system\b/i, ` in ${appName}`)
      .trim();
    const verb = /\b(create|submit|open|log|file|register|record|complete|book|raise)\b/i.exec(behaviorSentence)?.[1]?.toLowerCase() ?? "complete";
    const title = objectHint ? `${capitalize(verb)} a qualified ${objectHint}` : "Adoption program";
    const policyConstraints = sents.filter((s) => /\b(without|never|must not|do not|restricted|confidential|policy|approved tools?)\b/i.test(s) && !requirements.some((r) => r.text === s));
    const success =
      sents.find((s) => /\b(\d+\s*%|sustained|adoption|success)\b/i.test(s)) ??
      `Every run ends with a ${objectHint || "record"} that satisfies all ${requirements.length} requirements.`;
    return {
      title,
      population,
      targetBehavior: capitalize(targetBehavior),
      requirements,
      policyConstraints,
      successDefinition: success,
      objectHints: objectHint ? [objectHint] : [],
      entryHints: entryHint ? [entryHint] : [],
      confidence: requirements.length ? 0.7 : 0.4,
    };
  }

  async inferWorkflow({ parsed, states, graph, startUrl }: InferWorkflowInput): Promise<Workflow> {
    const requirements = parsed.requirements.filter((r) => r.kind === "field");
    const objectHint = parsed.objectHints[0] ?? "";

    // 1. Candidate form chains: states sharing a route, ordered by depth via parent links.
    const byRoute = new Map<string, DiscoveredState[]>();
    const routesWithFields = new Set(states.filter((s) => s.page.fields.length).map((s) => s.route));
    for (const s of states) {
      if (!routesWithFields.has(s.route)) continue;
      const list = byRoute.get(s.route) ?? [];
      list.push(s);
      byRoute.set(s.route, list);
    }
    let best: { route: string; chain: DiscoveredState[]; score: number; mapping: Map<string, { state: DiscoveredState; field: SemanticElement; score: number }> } | null = null;
    for (const [route, list] of byRoute) {
      const chain = orderChain(list);
      const formStates = chain.filter((s) => !s.page.dialogs.length);
      if (!formStates.length) continue;
      const mapping = new Map<string, { state: DiscoveredState; field: SemanticElement; score: number }>();
      let score = 0;
      for (const r of requirements) {
        let top: { state: DiscoveredState; field: SemanticElement; score: number } | null = null;
        for (const s of formStates) {
          for (const f of s.page.fields) {
            const sc = requirementFieldScore(r, f);
            if (!top || sc > top.score) top = { state: s, field: f, score: sc };
          }
        }
        if (top && top.score >= 0.3) {
          mapping.set(r.id, top);
          score += top.score;
        }
      }
      if (objectHint && (route.includes(objectHint) || formStates.some((s) => similarity(s.page.heading, objectHint) > 0.3))) score += 1;
      if (formStates.some((s) => s.page.actions.some((a) => a.commit))) score += 0.5;
      if (!best || score > best.score) best = { route, chain, score, mapping };
    }
    if (!best || best.mapping.size === 0) {
      return { id: `wf_${Date.now().toString(36)}`, title: parsed.title, startUrl, steps: [], successCriteria: requirements.map((r) => r.text), confidence: 0.2 };
    }

    const chain = best.chain;
    const formStates = chain.filter((s) => !s.page.dialogs.length);
    const first = formStates[0];
    const steps: WorkflowStep[] = [];
    let index = 0;
    const mkId = () => `s${++index}`;

    // 2. Entry steps from the human path to the first form state.
    const ancestors = ancestorsOf(first, states); // root … parent
    const entryRoute = ancestors.length ? ancestors[ancestors.length - 1] : undefined;
    if (entryRoute) {
      const entryIsRecord = entryRoute.route.includes(":id");
      const recordNoun = parsed.entryHints[0] ?? (entryIsRecord ? routeNoun(entryRoute.route) : undefined);
      // A record page often has a value for a heading ("$120.00", "INV-7007"); name the step after the record type instead.
      const headingIsValue = !entryRoute.page.heading || /^[$€£¥]?\s?[\d.,]+/.test(entryRoute.page.heading) || /^[A-Z]{1,5}-\d+/.test(entryRoute.page.heading);
      const openLabel = entryIsRecord ? `Open the ${recordNoun ?? "entry"} record` : `Open ${headingIsValue ? entryRoute.route : entryRoute.page.heading}`;
      const navActions: Action[] = [{ kind: "navigate", url: entryRoute.url, label: openLabel }];
      steps.push({
        id: mkId(),
        index: steps.length,
        title: recordNoun ? `Open the ${recordNoun} record` : !entryIsRecord ? `Open ${headingIsValue ? "the start page" : entryRoute.page.heading}` : headingIsValue ? `Open the record (${entryRoute.route})` : `Open the ${entryRoute.page.heading}`,
        description: `Navigate to ${entryRoute.route}.`,
        screenId: entryRoute.screenNodeId,
        route: entryRoute.route,
        actions: navActions,
        requirementIds: [],
        mode: "act",
        modeRationale: "Navigation carries no judgment; Synforma can perform it or the person can.",
        commit: false,
        judgment: false,
        anchor: { routePattern: entryRoute.route, heading: entryRoute.page.heading },
        expected: `${entryRoute.page.heading || "The record"} is open.`,
      });
      const via = first.path.slice(entryRoute.path.length).map((a) => (a.kind === "click" ? { ...a, targetCommit: false } : a));
      if (via.length) {
        steps.push({
          id: mkId(),
          index: steps.length,
          title: `Start the ${objectHint || "form"} from the ${parsed.entryHints[0] ?? "record"}`,
          description: via.map((a) => a.label).join(", then "),
          screenId: entryRoute.screenNodeId,
          route: entryRoute.route,
          actions: via,
          requirementIds: [],
          mode: "act",
          modeRationale: "Opening the form is mechanical. In Guide mode the person is shown where it is.",
          commit: false,
          judgment: false,
          anchor: { routePattern: entryRoute.route, elementName: via[0]?.targetName, role: via[0]?.targetRole },
          expected: `${first.page.heading} opens.`,
        });
      }
    } else {
      steps.push({
        id: mkId(),
        index: steps.length,
        title: `Open ${first.page.heading || first.route}`,
        actions: [{ kind: "navigate", url: first.url, label: `Open ${first.page.heading || first.route}` }],
        requirementIds: [],
        mode: "act",
        modeRationale: "Navigation carries no judgment.",
        commit: false,
        judgment: false,
        anchor: { routePattern: first.route, heading: first.page.heading },
        route: first.route,
        screenId: first.screenNodeId,
      });
    }

    // 3. One step per form state.
    for (let i = 0; i < formStates.length; i++) {
      const s = formStates[i];
      const stepHeading = s.page.fields[0]?.path.find((p) => /step \d/i.test(p)) ?? s.page.headings.find((h) => /step \d/i.test(h)) ?? s.page.fields[0]?.region;
      // Anchor on the section heading (h2) rather than the page heading (h1): the page heading matches every wizard screen.
      const sectionHeading = s.page.headings.find((h) => h && h !== s.page.heading);
      const anchorHeading = stepHeading ?? sectionHeading ?? s.page.heading;
      const reqsHere = requirements.filter((r) => best!.mapping.get(r.id)?.state.id === s.id);
      const actions: Action[] = [];
      const reveals: string[] = [];
      const revealedByName = (key: string) => Object.entries(s.revealed).find(([, keys]) => keys.includes(key))?.[0];
      // Required fields not tied to a requirement still need values to advance.
      const requiredFields = s.page.fields.filter((f) => f.required && !reqsHere.some((r) => best!.mapping.get(r.id)?.field.key === f.key));
      for (const f of requiredFields) {
        const rev = revealedByName(f.key);
        if (rev && !reveals.includes(rev)) {
          reveals.push(rev);
          actions.push(revealAction(s, rev));
        }
        actions.push(fillAction(f, `{{field:${f.key}}}`, `Fill ${f.name}`));
      }
      for (const r of reqsHere) {
        const m = best.mapping.get(r.id)!;
        const rev = revealedByName(m.field.key);
        if (rev && !reveals.includes(rev)) {
          reveals.push(rev);
          actions.push(revealAction(s, rev));
        }
        actions.push({ ...fillAction(m.field, `{{req:${r.id}}}`, `${m.field.name} ← requirement ${r.id.replace("r", "")}`) });
        // A requirement with a date expectation mapped to a non-date field: fill the companion date field too.
        if (r.expectation?.withinDays && !/date/i.test(m.field.name) && m.field.inputType !== "date") {
          const companion = s.page.fields.find((f) => f.key !== m.field.key && /date/i.test(f.name) && similarity(f.name.replace(/date/i, ""), m.field.name) > 0.6);
          if (companion) {
            const crev = revealedByName(companion.key);
            if (crev && !reveals.includes(crev)) {
              reveals.push(crev);
              actions.push(revealAction(s, crev));
            }
            actions.push({ ...fillAction(companion, `{{req:${r.id}:date}}`, `${companion.name} ← requirement ${r.id.replace("r", "")} (date)`) });
            upsertEdge(graph, nodeId("field", s.route, companion.key), nodeId("requirement", r.id), "fulfills", "date", m.score);
          }
        }
        // Graph: field fulfills requirement.
        const reqNode = nodeId("requirement", r.id);
        upsertNode(graph, { id: reqNode, type: "requirement", label: r.text, status: "confirmed", confidence: 1, data: { kind: r.kind, judgment: r.judgment } });
        upsertEdge(graph, nodeId("field", s.route, m.field.key), reqNode, "fulfills", `${Math.round(m.score * 100)}%`, m.score);
      }
      // A choice the objective names outright ("authenticated users", "Office equipment"): set the select that offers it,
      // even when the requirement was mapped to another field on this screen.
      for (const f of s.page.fields) {
        if ((f.role !== "combobox" && f.role !== "radio") || !f.options?.length) continue;
        if (actions.some((a) => a.target === f.key)) continue;
        for (const r of requirements) {
          const opt = f.options.find((o) => o.length >= 4 && !/^(select|choose|--)/i.test(o) && new RegExp(`\\b${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(r.text));
          if (opt) {
            const rev = revealedByName(f.key);
            if (rev && !reveals.includes(rev)) {
              reveals.push(rev);
              actions.push(revealAction(s, rev));
            }
            actions.push(fillAction(f, opt, `${f.name} ← requirement ${r.id.replace("r", "")} (${opt})`));
            upsertEdge(graph, nodeId("field", s.route, f.key), nodeId("requirement", r.id), "fulfills", opt, 0.6);
            break;
          }
        }
      }
      const nextBtn = s.page.actions.find((a) => a.role === "button" && NEXT_RE.test(a.name) && !a.commit);
      const commitBtn = terminalCommit(s.page.actions, parsed);
      const dialogChild =
        chain.find((c) => c.page.dialogs.length && (c.parentId === s.id || c.id === s.parentId)) ??
        states.find((c) => c.page.dialogs.length && (c.parentId === s.id || c.id === s.parentId));
      // The last form state is the one that ends the form: a terminal commit and no way forward.
      const isLast = i === formStates.length - 1 || (Boolean(commitBtn) && !nextBtn);
      if (nextBtn && !isLast) actions.push({ kind: "click", target: nextBtn.key, targetName: nextBtn.name, targetRole: "button", targetCommit: false, targetRegion: nextBtn.region, label: `Click ${nextBtn.name}` });

      const judgment = reqsHere.some((r) => r.judgment);
      const mode: ExecutionMode = judgment ? "guide" : reqsHere.length || requiredFields.length ? "assist" : "act";
      const modeRationale = judgment
        ? `Requirement${reqsHere.filter((r) => r.judgment).length > 1 ? "s" : ""} ${reqsHere.filter((r) => r.judgment).map((r) => r.id.replace("r", "")).join(", ")} need${reqsHere.filter((r) => r.judgment).length > 1 ? "" : "s"} human knowledge (who decides, what is funded). Synforma guides and never guesses.`
        : reqsHere.length || requiredFields.length
          ? "Values can be derived from the record and defaults; the person reviews before moving on."
          : "No judgment content: Synforma can perform this step outright.";

      if (!isLast || !commitBtn) {
        steps.push({
          id: mkId(),
          index: steps.length,
          title: stepHeading ? stepHeading.replace(/^step \d+ of \d+\s*[·:-]?\s*/i, "") || stepHeading : s.page.heading,
          description: reqsHere.length ? `Satisfies requirement${reqsHere.length > 1 ? "s" : ""} ${reqsHere.map((r) => r.id.replace("r", "")).join(", ")}.` : "Required fields only.",
          screenId: s.screenNodeId,
          route: s.route,
          actions,
          requirementIds: reqsHere.map((r) => r.id),
          mode,
          modeRationale,
          commit: false,
          judgment,
          anchor: { routePattern: s.route, heading: anchorHeading, elementName: reqsHere[0] ? best.mapping.get(reqsHere[0].id)!.field.name : requiredFields[0]?.name, role: reqsHere[0] ? best.mapping.get(reqsHere[0].id)!.field.role : requiredFields[0]?.role },
          expected: nextBtn ? `${nextBtn.name} leads to the next step.` : undefined,
          reveals,
        });
      }
      if (isLast && commitBtn) {
        const finalActions: Action[] = [...actions];
        // Consent gates: unchecked acknowledgement boxes on the commit screen are part of the workflow.
        for (const cb of s.page.fields.filter((f) => f.role === "checkbox" && !f.checked && CONSENT_RE.test(f.name))) {
          finalActions.push({ kind: "check", target: cb.key, targetName: cb.name, targetRole: "checkbox", value: "true", label: `Confirm "${cb.name}"` });
        }
        if (dialogChild) {
          const dismiss = dialogChild.page.actions.find((a) => a.inDialog && a.role === "button" && !a.commit && DISMISS_RE.test(a.name)) ?? dialogChild.page.actions.find((a) => a.inDialog && a.role === "button" && !a.commit);
          if (dismiss) finalActions.push({ kind: "click", target: dismiss.key, targetName: dismiss.name, targetRole: "button", label: `Acknowledge "${dialogChild.page.dialogs[0]}"` });
        }
        finalActions.push({ kind: "click", target: commitBtn.key, targetName: commitBtn.name, targetRole: "button", targetCommit: true, targetRegion: commitBtn.region, label: `Click ${commitBtn.name}` });
        steps.push({
          id: mkId(),
          index: steps.length,
          title: stepHeading ? stepHeading.replace(/^step \d+ of \d+\s*[·:-]?\s*/i, "") || "Review and create" : "Review and create",
          description: `Review the values${dialogChild ? `, acknowledge "${dialogChild.page.dialogs[0]}"` : ""} and ${commitBtn.name.toLowerCase()}.`,
          screenId: s.screenNodeId,
          route: s.route,
          actions: finalActions,
          requirementIds: reqsHere.map((r) => r.id),
          mode: "act",
          modeRationale: "The commit only confirms values already decided; it is approval-gated and audited.",
          commit: true,
          judgment: false,
          anchor: { routePattern: s.route, heading: anchorHeading, elementName: commitBtn.name, role: "button", dialogTitle: dialogChild?.page.dialogs[0] },
          expected: `A new ${objectHint || "record"} exists.`,
          reveals,
        });
      }
    }

    // 4. Outcome screen: detail page of the object with definitions.
    const outcome = states.find((s) => s.route.includes(":id") && s.page.definitions.length >= 3 && (!objectHint || s.route.includes(objectHint) || s.route.includes(objectHint.replace(/y$/, "ie"))));

    const wf: Workflow = {
      id: `wf_${Date.now().toString(36)}`,
      title: parsed.title,
      startUrl,
      steps,
      successCriteria: requirements.map((r) => r.text),
      outcomeRoutePattern: outcome?.route,
      confidence: Math.min(0.95, 0.4 + (best.mapping.size / Math.max(1, requirements.length)) * 0.5),
    };

    // Graph: workflow and steps.
    const wfNode = nodeId("workflow", wf.id);
    upsertNode(graph, { id: wfNode, type: "workflow", label: wf.title, status: "hypothesis", confidence: wf.confidence, data: { steps: steps.length } });
    for (const st of steps) {
      const stNode = nodeId("step", wf.id, st.id);
      upsertNode(graph, { id: stNode, type: "step", label: `${st.index + 1}. ${st.title}`, description: st.modeRationale, status: "hypothesis", confidence: wf.confidence, data: { mode: st.mode, commit: st.commit, judgment: st.judgment } });
      upsertEdge(graph, wfNode, stNode, "contains");
      if (st.screenId) upsertEdge(graph, stNode, st.screenId, "targets");
      for (const rid of st.requirementIds) upsertEdge(graph, stNode, nodeId("requirement", rid), "requires");
    }
    return wf;
  }

  async diagnose({ step, signals }: DiagnoseInput): Promise<DiagnoseOutput> {
    const counts: Record<string, number> = {};
    for (const s of signals) counts[s.type] = (counts[s.type] ?? 0) + 1;
    const evidence: string[] = [];
    const scores: Record<BarrierType, number> = {
      capability_knowledge: 0.1,
      capability_skill: 0.05,
      opportunity_visibility: 0.05,
      opportunity_friction: 0.05,
      motivation_uncertainty: 0.05,
      motivation_value: 0.02,
    };
    if (counts.validation_error) {
      scores.capability_skill += 0.5 * Math.min(2, counts.validation_error);
      evidence.push(`${counts.validation_error} validation error${counts.validation_error > 1 ? "s" : ""} on this step`);
    }
    if (counts.hesitation) {
      const hidden = (step.reveals?.length ?? 0) > 0;
      if (hidden) {
        scores.opportunity_visibility += 0.55 * Math.min(2, counts.hesitation);
        evidence.push(`hesitation on a step whose fields are behind "${step.reveals![0]}"`);
      } else if (step.judgment) {
        scores.motivation_uncertainty += 0.5 * Math.min(2, counts.hesitation);
        evidence.push("hesitation on a step that needs a judgment call");
      } else {
        scores.capability_knowledge += 0.4 * Math.min(2, counts.hesitation);
        evidence.push("hesitation without errors");
      }
    }
    if (counts.backtrack) {
      scores.capability_knowledge += 0.35 * Math.min(2, counts.backtrack);
      evidence.push(`${counts.backtrack} backtrack${counts.backtrack > 1 ? "s" : ""} to an earlier step`);
    }
    if (counts.wrong_screen) {
      scores.opportunity_visibility += 0.4;
      evidence.push("navigated to a screen outside the workflow");
    }
    if (counts.abandon) {
      if (step.commit) {
        scores.motivation_uncertainty += 0.45;
        evidence.push("abandoned at the commit step");
      } else {
        scores.opportunity_friction += 0.3;
        evidence.push("abandoned mid-step");
      }
    }
    const ranked = (Object.entries(scores) as [BarrierType, number][]).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((acc, [, v]) => acc + v, 0) || 1;
    const [barrier, top] = ranked[0];
    return {
      stepId: step.id,
      barrier,
      confidence: Math.min(0.9, top / total + 0.15),
      evidence: evidence.length ? evidence : ["insufficient signals; default prior"],
      alternatives: ranked.slice(1, 3).map(([b, v]) => ({ barrier: b, confidence: Math.max(0.05, v / total) })),
    };
  }

  async composeAssistance({ step, requirements, hypothesis, technique, policyConstraints }: ComposeAssistanceInput): Promise<AssistanceContent> {
    const reqs = requirements.filter((r) => step.requirementIds.includes(r.id));
    const reqList = reqs.map((r) => `${r.id.replace("r", "")}. ${r.text}`).join(" · ");
    const anchor: SemanticAnchor = { ...step.anchor };
    const hiddenBehind = step.reveals?.[0];
    const fieldAction = step.actions.find((a) => (a.kind === "type" || a.kind === "select" || a.kind === "check") && a.value?.startsWith("{{req:"));
    let title = step.title;
    let body = "";
    let offerAssist = !step.judgment;
    switch (technique.id) {
      case "clarify_consequence": {
        const commitName = step.actions.filter((a) => a.kind === "click").slice(-1)[0]?.targetName ?? step.anchor.elementName ?? "this action";
        anchor.elementName = commitName;
        anchor.role = "button";
        title = step.commit ? `What "${commitName}" does` : "What happens next";
        body = step.commit
          ? `"${commitName}" saves the record in ${step.anchor.heading ? "this system" : "the application"} only. Nothing is sent to the customer or outside the organization.`
          : `Continuing only moves to the next step; nothing is saved until the final ${commitName}.`;
        offerAssist = false;
        break;
      }
      case "recommend_redesign":
        title = "Noted for the process owners";
        body = hiddenBehind ? `Required fields sit behind "${hiddenBehind}". Synforma will recommend surfacing them by default.` : "This step imposes avoidable effort. Synforma will recommend a change to the process owners.";
        offerAssist = !step.judgment;
        break;
      case "contextual_pointer":
        if (hiddenBehind) {
          anchor.elementName = hiddenBehind;
          anchor.role = "button";
          title = `Some of this is under "${hiddenBehind}"`;
          body = `Expand "${hiddenBehind}" to reach the remaining fields for this step${reqs.length ? ` (${reqs.map((r) => r.id.replace("r", "")).join(", ")})` : ""}.`;
        } else {
          anchor.elementName = fieldAction?.targetName ?? step.anchor.elementName;
          title = `Next: ${fieldAction?.targetName ?? step.title}`;
          body = `The highlighted control is where this step happens.${reqs.length ? ` It satisfies requirement ${reqs[0].id.replace("r", "")}.` : ""}`;
        }
        break;
      case "inline_explanation":
        title = reqs.length ? `Why this step matters` : step.title;
        body = reqs.length ? `Your objective requires: ${reqList}. Records missing these are not considered qualified.` : step.description ?? "This step is part of the required workflow.";
        break;
      case "format_example":
        title = "Expected format";
        body = fieldAction && /date/i.test(fieldAction.targetName ?? "") ? `Enter the date as YYYY-MM-DD, for example ${isoDate(7)}.` : `Enter the value exactly as the field expects; the error message names the format.`;
        anchor.elementName = fieldAction?.targetName ?? anchor.elementName;
        offerAssist = true;
        break;
      case "policy_clarification": {
        const policy = policyConstraints[0];
        const accepted = reqs.find((r) => r.expectation?.acceptedValues?.length);
        title = "What counts here";
        body = accepted
          ? `Requirement ${accepted.id.replace("r", "")}: ${accepted.text}. Accepted: ${accepted.expectation!.acceptedValues!.join(", ")}.`
          : policy
            ? `Policy: ${policy}`
            : `Requirements for this step: ${reqList || "none beyond the form's own validation"}.`;
        offerAssist = false;
        break;
      }
      case "if_then_cue":
        title = "When you get here";
        body = `When ${step.anchor.heading ?? "this step"} opens, ${reqs.length ? `complete requirement${reqs.length > 1 ? "s" : ""} ${reqs.map((r) => r.id.replace("r", "")).join(", ")}` : "finish the step"} before moving on.`;
        break;
      case "requirement_checklist":
        title = "Requirements on this step";
        body = reqs.length ? reqs.map((r) => `${r.id.replace("r", "")}. ${r.text}`).join("\n") : "No objective requirements here — only the form's own required fields.";
        break;
      case "prefill_assist":
        title = "Synforma can prepare this";
        body = `The derivable values for this step can be filled from the record and defaults. ${step.judgment ? "Fields that need your judgment stay empty for you." : "Review before continuing."}`;
        offerAssist = true;
        break;
      case "act_on_behalf":
        title = "Synforma can do this step";
        body = `This step has no judgment content. Synforma can perform it; ${step.commit ? "the commit will ask for your approval." : "nothing is committed."}`;
        offerAssist = true;
        break;
      case "graded_first_run":
        title = "One step at a time";
        body = `Finish ${step.title.toLowerCase()} and Synforma will point out the next requirement as you go.`;
        break;
      default:
        title = step.title;
        body = step.description ?? "";
    }
    return {
      title,
      body,
      anchor,
      offerAssist,
      source: reqs.length ? `Objective requirement${reqs.length > 1 ? "s" : ""} ${reqs.map((r) => r.id.replace("r", "")).join(", ")}` : hypothesis.evidence[0],
    };
  }
}

// ─────────────── helpers ───────────────

export function requirementFieldScore(r: Requirement, f: SemanticElement): number {
  const hint = r.expectation?.fieldHint ?? r.text;
  const fieldText = [f.name, f.description ?? ""].join(" ");
  let s = similarity(hint, f.name) * 0.7 + similarity(hint, fieldText) * 0.2;
  const opts = f.options ?? [];
  if (opts.length) {
    const optText = opts.join(" ");
    const accepted = r.expectation?.acceptedValues ?? [];
    if (accepted.some((v) => opts.some((o) => o.toLowerCase() === v.toLowerCase()))) s += 0.35;
    else s += 0.15 * similarity(hint, optText);
    const rejected = r.expectation?.rejectedValues ?? [];
    if (rejected.some((v) => opts.some((o) => o.toLowerCase() === v.toLowerCase()))) s += 0.15;
  }
  if (f.role === "checkbox" && r.expectation?.acceptedValues?.some((v) => similarity(v, f.name) > 0.8)) s += 0.5;
  if (f.role === "checkbox" && f.description) s += 0.4 * similarity(hint, f.description);
  // An acknowledgement box ("I understand …") repeats the policy's words but holds no data: it is a gate, not the requirement's field.
  if ((f.role === "checkbox" || f.role === "switch") && CONSENT_RE.test(f.name) && /^(i |we )/i.test(f.name)) s *= 0.3;
  // "… enabled" / "… switched on" names a toggle.
  if (f.role === "switch" && /\b(enabled|switched on|turned on|on from the start|activated)\b/i.test(r.text)) s += 0.25;
  // Token overlap between requirement keywords and field tokens.
  const kw = new Set(r.keywords);
  const ft = tokenize(fieldText);
  const hits = ft.filter((t) => kw.has(t)).length;
  if (hits) s += Math.min(0.3, hits * 0.15);
  return Math.min(1, s);
}

function orderChain(list: DiscoveredState[]): DiscoveredState[] {
  const byId = new Map(list.map((s) => [s.id, s]));
  const roots = list.filter((s) => !s.parentId || !byId.has(s.parentId));
  const ordered: DiscoveredState[] = [];
  const visit = (s: DiscoveredState) => {
    if (ordered.includes(s)) return;
    ordered.push(s);
    list.filter((c) => c.parentId === s.id).sort((a, b) => a.depth - b.depth).forEach(visit);
  };
  roots.sort((a, b) => a.depth - b.depth).forEach(visit);
  for (const s of list) visit(s);
  return ordered;
}

function ancestorsOf(state: DiscoveredState, all: DiscoveredState[]): DiscoveredState[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const chain: DiscoveredState[] = [];
  let cur = state.parentId ? byId.get(state.parentId) : undefined;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.route !== state.route) chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

function revealAction(s: DiscoveredState, name: string): Action {
  const el = s.page.actions.find((a) => a.name === name) ?? s.page.fields.find((f) => f.name === name) ?? s.page.elements.find((e) => e.name === name);
  if (el && (el.role === "switch" || el.role === "checkbox")) return { kind: "check", target: el.key, targetName: name, targetRole: el.role, value: "true", label: `Turn on ${name}` };
  return { kind: "expand", target: el?.key, targetName: name, targetRole: el?.role === "tab" ? "tab" : "button", label: `Expand ${name}` };
}

function fillAction(f: SemanticElement, value: string, label: string): Action {
  const kind: Action["kind"] = f.role === "combobox" || f.role === "radio" ? "select" : f.role === "checkbox" || f.role === "switch" ? "check" : "type";
  return { kind, target: f.key, targetName: f.name, targetRole: f.role, targetRegion: f.region, value, label };
}

/** A context value can only go into a choice field when it is one of the choices. */
function isUsableValue(value: string, field?: SemanticElement): boolean {
  if (!field?.options?.length) return true;
  return field.options.some((o) => o.toLowerCase() === value.toLowerCase());
}

/** Resolve a templated value ({{req:r1}} / {{field:key}}) against run context and sensible defaults. */
export function resolveValue(
  action: Action,
  requirements: Requirement[],
  context: Record<string, string>,
  field?: SemanticElement,
): string {
  const v = action.value ?? "";
  const dateMatch = /^\{\{req:(\w+):date\}\}$/.exec(v);
  if (dateMatch) {
    const r = requirements.find((x) => x.id === dateMatch[1]);
    const fromContext = context[`${dateMatch[1]}:date`] ?? context.nextStepDate;
    if (fromContext) return fromContext;
    const within = r?.expectation?.withinDays ?? 14;
    return isoDate(Math.max(1, Math.min(7, within - 7)));
  }
  const reqMatch = /^\{\{req:(\w+)\}\}$/.exec(v);
  const fieldMatch = /^\{\{field:(.+)\}\}$/.exec(v);
  if (reqMatch) {
    const r = requirements.find((x) => x.id === reqMatch[1]);
    const fromContext = context[reqMatch[1]] ?? (r ? context[r.expectation?.fieldHint ?? ""] : undefined) ?? contextValueFor(context, [field?.name, r?.expectation?.fieldHint]);
    if (fromContext && isUsableValue(fromContext, field)) return fromContext;
    if (!r) return "";
    const accepted = r.expectation?.acceptedValues ?? [];
    const rejected = (r.expectation?.rejectedValues ?? []).map((x) => x.toLowerCase());
    if (field?.options?.length) {
      const opts = field.options.filter((o) => o && !/^(select|choose|--)/i.test(o) && !rejected.includes(o.toLowerCase()));
      const hit = opts.find((o) => accepted.some((a) => a.toLowerCase() === o.toLowerCase()));
      if (hit) return hit;
      // Prefer an option that looks like a person with a decision-making title when the requirement is about people.
      if (/decision|buyer|contact|stakeholder/i.test(r.text)) {
        const senior = opts.find((o) => /\b(vp|vice president|director|chief|head|cfo|ceo|coo|cto|owner|president)\b/i.test(o));
        if (senior) return senior;
      }
      return opts[0] ?? "";
    }
    if (field?.role === "checkbox") return "true";
    const dateLike = field?.inputType === "date" || /date/i.test(field?.name ?? "");
    if (dateLike && r.expectation?.atLeastDays) return isoDate(r.expectation.atLeastDays + 4);
    if (dateLike && r.expectation?.withinDays) return isoDate(Math.max(1, Math.min(7, r.expectation.withinDays - 7)));
    if (dateLike) return isoDate(7);
    if (/next step|next action|follow/i.test(field?.name ?? "") || /next step/i.test(r.text)) return context.nextStep ?? "Discovery call with the decision-maker";
    return accepted[0] ?? context[r.id] ?? "Confirmed";
  }
  if (fieldMatch) {
    const key = fieldMatch[1];
    if (context[key]) return context[key];
    const name = (field?.name ?? key).toLowerCase();
    const fromContext = contextValueFor(context, [field?.name ?? key]);
    if (fromContext && isUsableValue(fromContext, field)) return fromContext;
    if (field?.value && field.role !== "combobox") return field.value; // keep what the application prefilled
    if (field?.inputType === "date" || /date/.test(name)) return isoDate(30);
    if (field?.inputType === "number" || /amount|value|quantity|price/.test(name)) return "100";
    if (field?.options?.length) {
      const opts = field.options.filter((o) => o && !/^(select|choose|--)/i.test(o));
      const preferred = Object.values(context).find((v) => opts.some((o) => o.toLowerCase() === v.toLowerCase()));
      return preferred ?? opts[0] ?? "";
    }
    if (field?.role === "textarea") return "Entered by Synforma on behalf of the person.";
    return field?.value || "Synforma";
  }
  return v;
}

export function anchorMatches(anchor: SemanticAnchor, url: string, heading: string, headings: string[], dialogs: string[]): boolean {
  if (anchor.routePattern && generalizeRoute(url) !== anchor.routePattern) return false;
  if (anchor.dialogTitle && !dialogs.includes(anchor.dialogTitle)) return false;
  if (anchor.heading) {
    const target = anchor.heading.toLowerCase();
    const ok = heading.toLowerCase() === target || headings.some((h) => h.toLowerCase() === target || similarity(h, anchor.heading!) > 0.8);
    if (!ok) return false;
  }
  return true;
}

export { ground };
