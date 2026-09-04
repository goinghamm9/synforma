import type { ElementRole, PageModel, SemanticElement } from "../types";
import { accessibleDescription, accessibleName, groupName, isFormControl } from "./accessible-name";
import { hashString, normalizeText, slug } from "./text";

/**
 * Universal Interaction Layer — DOM observer.
 *
 * Produces a semantic PageModel from a live Document. Works on any web
 * application that uses reasonable HTML semantics and ARIA. Nothing here is
 * specific to the sandbox application.
 */

export interface Snapshot {
  page: PageModel;
  /** Semantic key → live element. Not serializable; valid until the DOM changes. */
  elements: Map<string, Element>;
}

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='tab']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='combobox']",
  "[role='option']",
  "[role='textbox']",
].join(",");

const COMMIT_BUTTON_RE =
  /^(create|submit|save|delete|remove|send|pay|approve|publish|archive|purchase|transfer|post|reset|clear|wipe|confirm|complete|finish|book|order|issue)\b/i;
const SAFE_BUTTON_RE = /^(next|continue|back|previous|cancel|close|dismiss|i understand|ok|okay|got it|skip|expand|collapse|show|hide|more|open|view|filter|search|sort|edit)\b/i;

const ID_SEGMENT_RE = /^([A-Z]{1,4}-\d+|\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,})$/i;

export function generalizeRoute(url: string): string {
  const [path, query] = url.split("?");
  const segments = path
    .split("/")
    .map((s) => (ID_SEGMENT_RE.test(s) ? ":id" : s))
    .join("/");
  if (!query) return segments;
  const params = query
    .split("&")
    .map((kv) => kv.split("=")[0])
    .filter(Boolean)
    .sort()
    .map((k) => `${k}=:v`)
    .join("&");
  return params ? `${segments}?${params}` : segments;
}

function roleOf(el: Element): ElementRole {
  const explicit = (el.getAttribute("role") ?? "").toLowerCase();
  if (explicit) {
    switch (explicit) {
      case "button":
      case "link":
      case "textbox":
      case "combobox":
      case "checkbox":
      case "radio":
      case "switch":
      case "tab":
      case "menu":
      case "dialog":
      case "heading":
      case "option":
      case "alert":
      case "row":
      case "cell":
        return explicit;
      case "menuitem":
      case "menuitemcheckbox":
      case "menuitemradio":
        return "menuitem";
      case "alertdialog":
        return "dialog";
      default:
        break;
    }
  }
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button" || tag === "summary") return "button";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textarea";
  if (tag === "input") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button" || type === "reset") return "button";
    return "textbox";
  }
  if (/^h[1-6]$/.test(tag)) return "heading";
  return "unknown";
}

/** Rendered on screen, ignoring aria-hidden (used for headings behind a modal). */
export function isRendered(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  if (el.closest("[hidden], next-route-announcer, nextjs-portal, #__next-route-announcer__")) return false;
  const style = view.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function isVisible(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  if (el.closest("[aria-hidden='true'], [hidden], [inert], next-route-announcer, nextjs-portal, #__next-route-announcer__")) return false;
  const style = view.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function landmarkLabel(el: Element, doc: Document): string | null {
  const tag = el.tagName.toLowerCase();
  const role = (el.getAttribute("role") ?? "").toLowerCase();
  const aria = el.getAttribute("aria-label");
  const isLandmark =
    ["main", "nav", "header", "footer", "aside", "form"].includes(tag) ||
    ["main", "navigation", "banner", "contentinfo", "complementary", "form", "region", "dialog", "alertdialog", "search"].includes(role);
  if (!isLandmark) return null;
  if (aria) return aria;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const t = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (t) return t;
  }
  if (role === "dialog" || role === "alertdialog") return "dialog";
  return tag === "main" || role === "main" ? "main" : null;
}

function headingText(h: Element): string {
  return (h.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Container path from outermost to innermost: landmarks, preceding headings, disclosure/tab labels. */
function containerPath(el: Element, doc: Document): string[] {
  const path: string[] = [];
  const seen = new Set<Element>();
  let node: Element | null = el.parentElement;
  while (node && node !== doc.documentElement) {
    const local: string[] = [];
    // Disclosure content: an element elsewhere controls this container.
    if (node.id) {
      const controller = doc.querySelector(`[aria-controls="${CSS.escape(node.id)}"]`);
      if (controller && controller !== el && !controller.contains(el)) {
        const n = accessibleName(controller, doc);
        if (n) local.push(n);
      }
    }
    const lm = landmarkLabel(node, doc);
    if (lm && lm !== "main") local.push(lm);
    // Nearest preceding heading inside this container (not containing the element).
    const headings = Array.from(node.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']")).filter(
      (h) => !seen.has(h) && !h.contains(el) && Boolean(h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && isVisible(h),
    );
    if (headings.length) {
      const h = headings[headings.length - 1];
      local.push(headingText(h));
      headings.forEach((x) => seen.add(x));
    }
    if (local.length) path.unshift(...local);
    node = node.parentElement;
  }
  // De-duplicate consecutive repeats.
  return path.filter((p, i) => p && path[i - 1] !== p);
}

function classifyCommit(role: ElementRole, name: string, el: Element): boolean {
  if (role !== "button") return false;
  if (el.getAttribute("type") === "submit" && !SAFE_BUTTON_RE.test(name)) return true;
  if (SAFE_BUTTON_RE.test(name)) return false;
  return COMMIT_BUTTON_RE.test(name);
}

export function snapshotDocument(doc: Document, url: string): Snapshot {
  const elements = new Map<string, Element>();
  const models: SemanticElement[] = [];
  const keyCounts = new Map<string, number>();

  const openDialogs = Array.from(doc.querySelectorAll("[role='dialog'],[role='alertdialog']")).filter(isVisible);
  const dialogTitles = openDialogs.map((d) => {
    const lb = d.getAttribute("aria-labelledby");
    const t = lb
      ? lb
          .split(/\s+/)
          .map((id) => doc.getElementById(id)?.textContent ?? "")
          .join(" ")
      : d.getAttribute("aria-label") ?? d.querySelector("h1,h2,h3")?.textContent ?? "Dialog";
    return t.replace(/\s+/g, " ").trim();
  });

  const nodes = Array.from(doc.querySelectorAll(INTERACTIVE_SELECTOR));
  const radioGroupsSeen = new Set<string>();

  for (const el of nodes) {
    const role = roleOf(el);
    if (role === "unknown" || role === "heading") continue;
    const visible = isVisible(el);
    if (!visible) continue;
    // Skip elements that are only containers of other interactive elements (e.g. a link wrapping a button).
    let name = accessibleName(el, doc);
    if (role === "radio") {
      const input = el as HTMLInputElement;
      const gname = groupName(el, doc) || input.name || name;
      if (input.name && radioGroupsSeen.has(input.name)) continue;
      if (input.name) radioGroupsSeen.add(input.name);
      const group = input.name ? Array.from(doc.querySelectorAll(`input[type='radio'][name="${CSS.escape(input.name)}"]`)) : [el];
      const options = group.map((r) => accessibleName(r, doc)).filter(Boolean);
      const checked = group.find((r) => (r as HTMLInputElement).checked);
      name = gname;
      const model = buildModel(el, role, name, doc, visible, {
        options,
        value: checked ? accessibleName(checked, doc) : "",
      });
      register(model, el);
      continue;
    }
    if (!name) {
      // Unnamed control: try the nearest heading as a last resort so it still appears.
      name = role === "textbox" || role === "textarea" || role === "combobox" ? "Unlabeled field" : "Unlabeled control";
    }
    const model = buildModel(el, role, name, doc, visible, {});
    register(model, el);
  }

  function register(model: SemanticElement, el: Element) {
    const base = `${model.role}:${slug(model.name) || "unnamed"}`;
    let key = base;
    if (keyCounts.has(base)) {
      const withRegion = model.region ? `${base}@${slug(model.region)}` : base;
      key = withRegion;
      if (keyCounts.has(withRegion) || withRegion === base) {
        const n = (keyCounts.get(withRegion) ?? keyCounts.get(base) ?? 0) + 1;
        key = `${withRegion}#${n}`;
      }
    }
    keyCounts.set(base, (keyCounts.get(base) ?? 0) + 1);
    if (key !== base) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    model.key = key;
    elements.set(key, el);
    models.push(model);
  }

  function buildModel(
    el: Element,
    role: ElementRole,
    name: string,
    d: Document,
    visible: boolean,
    extra: { options?: string[]; value?: string },
  ): SemanticElement {
    const path = containerPath(el, d);
    const rect = el.getBoundingClientRect();
    const inDialog = Boolean(el.closest("[role='dialog'],[role='alertdialog']"));
    const model: SemanticElement = {
      key: "",
      role,
      name,
      visible,
      path,
      region: path.length ? path[path.length - 1] : undefined,
      rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
      inDialog,
    };
    const desc = accessibleDescription(el, d);
    if (desc) model.description = desc;
    const disabled = (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
    if (disabled) model.disabled = true;
    const invalid = el.getAttribute("aria-invalid") === "true";
    if (invalid) model.invalid = true;
    const expanded = el.getAttribute("aria-expanded");
    if (expanded !== null) model.expanded = expanded === "true";
    if (role === "tab") model.expanded = el.getAttribute("aria-selected") === "true";
    if (el.hasAttribute("required") || el.getAttribute("aria-required") === "true") model.required = true;
    if (role === "link") {
      const href = (el as HTMLAnchorElement).getAttribute("href") ?? "";
      model.href = href;
    }
    if (isFormControl(el)) {
      const input = el as HTMLInputElement;
      const tag = el.tagName.toLowerCase();
      if (tag === "input") model.inputType = (input.type || "text").toLowerCase();
      if (tag === "select") {
        const select = el as HTMLSelectElement;
        model.options = Array.from(select.options).map((o) => o.text.trim());
        model.value = select.selectedOptions[0]?.text.trim() ?? "";
      } else if (role === "checkbox") {
        model.checked = input.checked;
        const g = groupName(el, d);
        if (g) model.description = model.description ? `${g} · ${model.description}` : g;
      } else if (role === "radio") {
        model.options = extra.options;
        model.value = extra.value;
      } else {
        model.value = input.value ?? "";
      }
    } else if (role === "checkbox" || role === "switch") {
      model.checked = el.getAttribute("aria-checked") === "true" || el.getAttribute("data-state") === "checked";
    }
    if (role === "button" || role === "menuitem") {
      model.commit = classifyCommit(role, name, el);
      if (el.getAttribute("aria-haspopup")) {
        model.popup = true;
        model.expanded = el.getAttribute("aria-expanded") === "true";
      }
    }
    return model;
  }

  const headingEls = Array.from(doc.querySelectorAll("h1,h2,h3")).filter(isRendered);
  const h1 = headingEls.find((h) => h.tagName.toLowerCase() === "h1");
  const heading = h1 ? headingText(h1) : (doc.title || "").trim();
  const secondaryHeadings = headingEls.filter((h) => h.tagName.toLowerCase() !== "h1").map(headingText);

  const alerts = Array.from(doc.querySelectorAll("[role='alert'],[aria-live='assertive']"))
    .filter(isVisible)
    .map((a) => (a.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const landmarks = Array.from(doc.querySelectorAll("main,nav,header,footer,aside,form,[role]"))
    .map((el) => landmarkLabel(el, doc))
    .filter((x): x is string => Boolean(x));

  const tables = Array.from(doc.querySelectorAll("table"))
    .filter(isVisible)
    .map((t) => {
      const headers = Array.from(t.querySelectorAll("thead th, thead td")).map(headingText).filter(Boolean);
      const rows = t.querySelectorAll("tbody tr").length;
      const caption = t.querySelector("caption");
      const labelled = t.getAttribute("aria-label") ?? (caption ? headingText(caption) : "");
      let name = labelled;
      if (!name) {
        // Nearest preceding heading.
        let n: Element | null = t;
        while (n && !name) {
          let sib = n.previousElementSibling;
          while (sib && !name) {
            if (/^h[1-6]$/i.test(sib.tagName)) name = headingText(sib);
            else {
              const h = sib.querySelector("h1,h2,h3,h4");
              if (h) name = headingText(h);
            }
            sib = sib.previousElementSibling;
          }
          n = n.parentElement;
        }
      }
      return { name: name || heading || "Table", headers, rows };
    });

  const definitions: { label: string; value: string }[] = [];
  for (const dl of Array.from(doc.querySelectorAll("dl")).filter(isVisible)) {
    const dts = Array.from(dl.querySelectorAll("dt"));
    for (const dt of dts) {
      let dd = dt.nextElementSibling;
      while (dd && dd.tagName.toLowerCase() !== "dd") dd = dd.nextElementSibling;
      const label = headingText(dt);
      const value = dd ? headingText(dd) : "";
      if (label) definitions.push({ label, value });
    }
  }

  const fields = models.filter((m) => ["textbox", "textarea", "combobox", "checkbox", "radio", "switch"].includes(m.role));
  const actions = models.filter((m) => ["button", "link", "menuitem", "tab"].includes(m.role));

  const route = generalizeRoute(url);
  const fpParts = [
    route,
    dialogTitles.join("|"),
    secondaryHeadings.join("|"),
    fields.map((f) => f.key).sort().join(","),
    actions
      .filter((a) => a.role !== "link" || !a.href || generalizeRoute(a.href) === a.href)
      .map((a) => a.key)
      .sort()
      .join(","),
  ];

  const page: PageModel = {
    url,
    title: (doc.title || "").trim(),
    heading,
    headings: headingEls.map(headingText),
    landmarks: Array.from(new Set(landmarks)),
    elements: models,
    fields,
    actions,
    alerts,
    dialogs: dialogTitles,
    tables,
    definitions,
    fingerprint: hashString(fpParts.join("||")),
    capturedAt: Date.now(),
  };
  return { page, elements };
}

/** Normalized display name of a page state: route pattern + secondary headings. */
export function describeState(page: PageModel): string {
  const route = generalizeRoute(page.url);
  const dialog = page.dialogs.length ? ` [${page.dialogs.join(", ")}]` : "";
  return `${page.heading || route}${dialog}`;
}

export function pageStateLabel(page: PageModel): string {
  const stepHeading = page.fields.length ? page.fields[0].path.find((p) => /step \d/i.test(p)) : undefined;
  const base = page.heading || normalizeText(generalizeRoute(page.url));
  const parts = [base];
  if (stepHeading) parts.push(stepHeading);
  if (page.dialogs.length) parts.push(page.dialogs.join(", "));
  return parts.join(" · ");
}
