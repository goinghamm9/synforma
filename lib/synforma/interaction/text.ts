/**
 * Lexical utilities for semantic matching.
 *
 * Synforma never addresses interface elements by DOM ids or CSS classes. It
 * matches on meaning: accessible names, roles, surrounding headings and a
 * small enterprise-work synonym lexicon. A live LLM planner improves on this;
 * the heuristic planner relies on it entirely.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "with", "at", "by", "is", "are", "be",
  "this", "that", "it", "as", "from", "into", "must", "should", "need", "needs", "they", "their", "we",
  "our", "you", "your", "have", "has", "not", "no", "any", "all", "least", "one", "than", "then",
  "when", "if", "please", "select", "enter", "choose", "field", "value", "set", "record", "recorded",
  "properly", "system", "within", "these", "five", "complete", "required", "requirement", "requirements",
]);

/** Small synonym lexicon for enterprise work vocabulary. Each group is an equivalence class. */
export const SYNONYM_GROUPS: string[][] = [
  ["budget", "funding", "financial", "spend", "money"],
  ["decision-maker", "decisionmaker", "decision maker", "economic buyer", "buyer", "champion", "stakeholder", "sponsor", "approver"],
  ["timeline", "timeframe", "time frame", "schedule", "horizon", "when"],
  ["next step", "next action", "follow-up", "followup", "follow up", "action item"],
  ["competitor", "competitors", "competition", "alternative", "alternatives", "rival", "incumbent"],
  ["convert", "create", "new", "start", "open", "add", "make"],
  ["opportunity", "deal", "opp"],
  ["lead", "prospect", "inquiry"],
  ["actions", "more options", "options", "menu", "more"],
  ["advanced", "additional", "more details", "extra", "details", "other"],
  ["continue", "next", "proceed"],
  ["save", "submit", "confirm"],
  ["contact", "person", "name"],
  ["confirmed", "approved", "allocated", "committed"],
  ["date", "day", "scheduled", "schedule"],
  ["amount", "value", "size", "revenue"],
  ["close", "closing", "expected close"],
  ["qualification", "qualify", "qualified", "qualifying"],
  ["review", "summary", "check"],
  ["employee", "employees", "rep", "reps", "user", "users", "people", "staff"],
  ["account executive", "account executives", "ae", "aes", "sales rep", "sales reps", "seller", "sellers"],
];

const CANONICAL = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canon = group[0];
  for (const term of group) CANONICAL.set(term, canon);
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function slug(s: string): string {
  return normalizeText(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Tokenize with synonym canonicalization (multi-word synonyms are matched first). */
export function tokenize(s: string): string[] {
  let text = normalizeText(s);
  // Replace multi-word synonyms with their canonical form joined by underscore.
  for (const [term, canon] of CANONICAL) {
    if (term.includes(" ") || term.includes("-")) {
      const re = new RegExp(term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
      text = text.replace(re, canon.replace(/[\s-]+/g, "_"));
    }
  }
  return text
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => {
      const plain = t.replace(/_/g, " ");
      const canon = CANONICAL.get(plain) ?? CANONICAL.get(t) ?? plain;
      return canon.replace(/[\s-]+/g, "_");
    })
    .map(stem);
}

/** Very small stemmer: strips common English suffixes. */
export function stem(t: string): string {
  if (t.length <= 4) return t;
  return t.replace(/(ings|ing|ies|ed|es|s)$/u, (m) => (m === "ies" ? "y" : ""));
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Overlap coefficient — how much of the smaller set is covered. */
export function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

/**
 * Similarity between two phrases in [0, 1].
 * Combines exact match, substring containment, token overlap and Jaccard.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokenize(na);
  const tb = tokenize(nb);
  if (!ta.length || !tb.length) return na.includes(nb) || nb.includes(na) ? 0.6 : 0;
  const ov = overlap(ta, tb);
  const jc = jaccard(ta, tb);
  const contains = na.includes(nb) || nb.includes(na) ? 0.15 : 0;
  return Math.min(1, 0.55 * ov + 0.35 * jc + contains);
}

export function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
