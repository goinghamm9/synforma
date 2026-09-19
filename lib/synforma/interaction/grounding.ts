import type { ElementRole, PageModel, SemanticElement } from "../types";
import { similarity, tokenize } from "./text";

/**
 * Semantic grounding: find the element on the current page that best matches
 * a description (role + name + region), without any selector. This is what
 * makes workflows survive vendor UI updates.
 */

export interface GroundingCandidate {
  element: SemanticElement;
  score: number;
  reasons: string[];
}

export interface GroundingQuery {
  key?: string;
  name?: string;
  role?: ElementRole;
  region?: string;
  /** Extra descriptive text: requirement wording, option values, etc. */
  hints?: string[];
  /** Restrict to field-like or action-like elements. */
  kind?: "field" | "action" | "any";
  /** Prefer elements inside an open dialog (or outside). */
  inDialog?: boolean;
  /** Prefer commit controls (true) or non-commit controls (false). */
  commit?: boolean;
}

const ROLE_FAMILIES: Record<string, ElementRole[]> = {
  button: ["button", "menuitem", "link", "tab"],
  menuitem: ["menuitem", "button", "link"],
  link: ["link", "button", "menuitem", "tab"],
  tab: ["tab", "button"],
  textbox: ["textbox", "textarea", "combobox"],
  textarea: ["textarea", "textbox"],
  combobox: ["combobox", "textbox", "radio"],
  checkbox: ["checkbox", "switch", "radio"],
  radio: ["radio", "combobox", "checkbox"],
  switch: ["switch", "checkbox"],
};

export function scoreCandidate(q: GroundingQuery, el: SemanticElement): GroundingCandidate {
  const reasons: string[] = [];
  let score = 0;
  if (q.key && el.key === q.key) {
    return { element: el, score: 1, reasons: ["exact semantic key"] };
  }
  if (q.role) {
    if (el.role === q.role) {
      score += 0.25;
      reasons.push(`role ${el.role}`);
    } else if (ROLE_FAMILIES[q.role]?.includes(el.role)) {
      score += 0.12;
      reasons.push(`compatible role ${el.role}`);
    } else {
      score -= 0.3;
    }
  }
  if (q.name) {
    const s = similarity(q.name, el.name);
    score += 0.6 * s;
    if (s > 0.99) reasons.push("same name");
    else if (s > 0.3) reasons.push(`name similar (${Math.round(s * 100)}%)`);
    // Description and options carry meaning too (e.g. "Approved" in a budget select).
    const extra = [el.description ?? "", ...(el.options ?? [])].join(" ");
    if (extra) {
      const se = similarity(q.name, extra);
      if (se > 0.2) {
        score += 0.15 * se;
        reasons.push("description/options overlap");
      }
    }
  }
  if (q.hints?.length) {
    const hintText = q.hints.join(" ");
    const target = [el.name, el.description ?? "", el.region ?? "", ...(el.options ?? [])].join(" ");
    const sh = similarity(hintText, target);
    if (sh > 0) {
      score += 0.25 * sh;
      if (sh > 0.25) reasons.push("hint overlap");
    }
  }
  if (q.region && el.region) {
    const sr = similarity(q.region, el.region);
    if (sr > 0.5) {
      score += 0.1 * sr;
      reasons.push("same region");
    }
  }
  if (q.inDialog !== undefined) {
    if (Boolean(el.inDialog) === q.inDialog) score += 0.05;
    else score -= 0.2;
  }
  if (q.commit !== undefined && (el.role === "button" || el.role === "menuitem" || el.role === "link")) {
    if (Boolean(el.commit) === q.commit) {
      score += 0.2;
      reasons.push(q.commit ? "commit control" : "non-commit control");
    } else score -= 0.2;
  }
  if (el.disabled) score -= 0.2;
  return { element: el, score: Math.max(0, Math.min(1, score)), reasons };
}

export function candidatesFor(q: GroundingQuery, page: PageModel): GroundingCandidate[] {
  const pool =
    q.kind === "field" ? page.fields : q.kind === "action" ? page.actions : page.elements;
  return pool
    .map((el) => scoreCandidate(q, el))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

const FORWARD_RE = /^(next|continue|proceed|forward)\b/i;
const BACKWARD_RE = /^(back|previous|prev|cancel|close|dismiss|return)\b/i;

/** "Next" must never land on "Back": a renamed control keeps its direction. */
function oppositeDirection(a: string | undefined, b: string): boolean {
  if (!a) return false;
  return (FORWARD_RE.test(a) && BACKWARD_RE.test(b)) || (BACKWARD_RE.test(a) && FORWARD_RE.test(b));
}

/** Initials of a multi-word name ("Row level security" → "rls"). */
function initials(name: string): string | null {
  const words = tokenize(name).filter((t) => t.length > 1);
  return words.length >= 3 ? words.map((w) => w[0]).join("") : null;
}

/** A renamed control that keeps the old name's acronym ("Row level security" → "RLS protection"), or the reverse. */
function acronymMatch(a: string, b: string): boolean {
  const ia = initials(a);
  const ib = initials(b);
  const ta = tokenize(a);
  const tb = tokenize(b);
  return Boolean((ia && tb.includes(ia)) || (ib && ta.includes(ib)));
}

export function ground(q: GroundingQuery, page: PageModel, threshold = 0.42): GroundingCandidate | null {
  if (q.key) {
    const exact = page.elements.find((e) => e.key === q.key);
    if (exact) return { element: exact, score: 1, reasons: ["exact semantic key"] };
  }
  const [best, second] = candidatesFor(q, page).filter((c) => !oppositeDirection(q.name, c.element.name));
  const lexicalOk = Boolean(best) && best!.score >= threshold && !(second && best!.score < 0.6 && second.score > best!.score - 0.05);
  if (!lexicalOk && q.role === "menuitem" && q.name) {
    // Inside an open menu the choice is small: the one item that shares a content word with the old name is it.
    const words = new Set(tokenize(q.name).filter((t) => t.length > 2));
    const items = page.elements.filter((e) => e.role === "menuitem" && !e.disabled);
    const sharing = items.filter((e) => tokenize(e.name).some((t) => words.has(t)));
    if (sharing.length === 1) return { element: sharing[0], score: threshold, reasons: ["only menu item sharing a word with the old name"] };
  }
  if (!lexicalOk && q.name) {
    const sameRole = page.elements.filter((e) => !e.disabled && (!q.role || e.role === q.role) && acronymMatch(q.name!, e.name));
    if (sameRole.length === 1) return { element: sameRole[0], score: threshold, reasons: ["acronym of the old name"] };
  }
  if (!lexicalOk && q.commit === true && q.kind !== "field") {
    // A renamed commit verb ("Submit" → "Order") shares no words; when the screen has exactly one commit control, that is it.
    const commits = page.elements.filter((e) => e.commit && !e.disabled && (e.role === "button" || e.role === "menuitem"));
    const inRegion = q.region ? commits.filter((e) => e.region === q.region) : commits;
    const pool = inRegion.length ? inRegion : commits;
    if (pool.length === 1) return { element: pool[0], score: threshold, reasons: ["only commit control on this screen"] };
  }
  if (!best || best.score < threshold) return null;
  // Ambiguity guard: if two candidates are nearly tied and both weak, refuse.
  if (second && best.score < 0.6 && second.score > best.score - 0.05) return null;
  return best;
}

/** Tokens of a requirement or hint used for field matching. */
export function keywordsOf(text: string): string[] {
  return Array.from(new Set(tokenize(text)));
}
