/**
 * A pragmatic accessible-name computation. It follows the spirit of the
 * WAI-ARIA accname algorithm without attempting to be exhaustive: it covers
 * what real enterprise web applications expose.
 */

const collapse = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function textOf(el: Element | null): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("[aria-hidden='true'], script, style, svg").forEach((n) => n.remove());
  return collapse(clone.textContent);
}

function labelledBy(el: Element, doc: Document): string {
  const ids = el.getAttribute("aria-labelledby");
  if (!ids) return "";
  return collapse(
    ids
      .split(/\s+/)
      .map((id) => textOf(doc.getElementById(id)))
      .filter(Boolean)
      .join(" "),
  );
}

function describedBy(el: Element, doc: Document): string {
  const ids = el.getAttribute("aria-describedby");
  if (!ids) return "";
  return collapse(
    ids
      .split(/\s+/)
      .map((id) => textOf(doc.getElementById(id)))
      .filter(Boolean)
      .join(" "),
  );
}

export function isFormControl(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "select" || tag === "textarea";
}

export function accessibleName(el: Element, doc: Document): string {
  const byLabelledBy = labelledBy(el, doc);
  if (byLabelledBy) return byLabelledBy;
  const ariaLabel = collapse(el.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;

  if (isFormControl(el)) {
    const input = el as HTMLInputElement;
    if (input.id) {
      const label = doc.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      const t = textOf(label);
      if (t) return t;
    }
    const wrapping = el.closest("label");
    if (wrapping) {
      const clone = wrapping.cloneNode(true) as Element;
      clone.querySelectorAll("input, select, textarea").forEach((n) => n.remove());
      const t = collapse(clone.textContent);
      if (t) return t;
    }
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    if ((type === "submit" || type === "button") && input.value) return collapse(input.value);
    const placeholder = collapse(el.getAttribute("placeholder"));
    if (placeholder) return placeholder;
    const title = collapse(el.getAttribute("title"));
    if (title) return title;
    return "";
  }

  const text = textOf(el);
  if (text) return text;
  const img = el.querySelector("img[alt]");
  if (img) return collapse(img.getAttribute("alt"));
  const title = collapse(el.getAttribute("title"));
  if (title) return title;
  return "";
}

export function accessibleDescription(el: Element, doc: Document): string {
  const d = describedBy(el, doc);
  if (d) return d;
  // Help text rendered as a sibling small/p element right after the control.
  const parent = el.parentElement;
  if (parent) {
    const next = el.nextElementSibling;
    if (next && /^(p|small|span|div)$/i.test(next.tagName) && next.getAttribute("role") !== "alert") {
      const t = textOf(next);
      if (t && t.length < 120) return t;
    }
  }
  return "";
}

/** Group name for radios/checkboxes: nearest fieldset legend or labelled group. */
export function groupName(el: Element, doc: Document): string {
  const group = el.closest("fieldset, [role='group'], [role='radiogroup']");
  if (!group) return "";
  const legend = group.querySelector("legend");
  if (legend) return textOf(legend);
  return labelledBy(group, doc) || collapse(group.getAttribute("aria-label"));
}
