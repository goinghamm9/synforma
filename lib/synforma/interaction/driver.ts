import type { Action, ActionResult, ElementRect, PageModel, SemanticElement } from "../types";
import { ground } from "./grounding";
import { snapshotDocument, type Snapshot } from "./snapshot";

/**
 * Universal Interaction Layer — browser driver for a same-origin <iframe>.
 *
 * In production the same interface is implemented over a browser extension,
 * Playwright, APIs and MCP. Here it drives the embedded target application
 * through nothing but generic DOM semantics.
 */

export interface DriverEvents {
  onCursor?: (rect: ElementRect | null, label?: string) => void;
  onHighlight?: (rect: ElementRect | null, label?: string) => void;
  onNavigate?: (url: string) => void;
  onLog?: (message: string) => void;
}

export interface DriverOptions {
  /** Delay before each action so a person can follow along. */
  paceMs?: number;
  events?: DriverEvents;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class IframeDriver {
  private last: Snapshot | null = null;
  paceMs: number;
  events: DriverEvents;

  constructor(
    private readonly iframe: HTMLIFrameElement,
    opts: DriverOptions = {},
  ) {
    this.paceMs = opts.paceMs ?? 300;
    this.events = opts.events ?? {};
  }

  get doc(): Document | null {
    try {
      return this.iframe.contentDocument;
    } catch {
      return null;
    }
  }

  get win(): Window | null {
    return this.iframe.contentWindow;
  }

  currentUrl(): string {
    const w = this.win;
    if (!w) return "";
    try {
      return w.location.pathname + w.location.search;
    } catch {
      return "";
    }
  }

  /** Bounding rectangle of the iframe in the parent document (for overlays). */
  frameRect(): DOMRect {
    return this.iframe.getBoundingClientRect();
  }

  async goto(url: string): Promise<PageModel> {
    const current = this.currentUrl();
    if (current === url && this.doc && this.doc.readyState === "complete") {
      await this.waitForSettle(800);
      return this.snapshot().page;
    }
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.iframe.removeEventListener("load", finish);
        resolve();
      };
      this.iframe.addEventListener("load", finish);
      setTimeout(finish, 8000);
      this.iframe.src = url;
    });
    await this.waitForSettle(1500);
    // Readiness: client-rendered applications may hydrate after load. Wait until the page exposes
    // interactive elements (or a heading) before reporting it, up to ~4s.
    for (let i = 0; i < 16; i++) {
      const snap = this.snapshot();
      if (snap.page.elements.length > 0 || snap.page.headings.length > 0) break;
      await sleep(250);
    }
    this.events.onNavigate?.(this.currentUrl());
    return this.snapshot().page;
  }

  /** Resolve when the DOM has been quiet for `quiet` ms, or after `timeout` ms. */
  async waitForSettle(timeout = 2000, quiet = 180): Promise<void> {
    const doc = this.doc;
    if (!doc) return sleep(Math.min(timeout, 300));
    await new Promise<void>((resolve) => {
      let quietTimer: ReturnType<typeof setTimeout> | null = null;
      let finished = false;
      const observer = new MutationObserver(() => {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quiet);
      });
      const done = () => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        if (quietTimer) clearTimeout(quietTimer);
        clearTimeout(hard);
        this.iframe.removeEventListener("load", done);
        resolve();
      };
      const hard = setTimeout(done, timeout);
      try {
        observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
      } catch {
        done();
        return;
      }
      this.iframe.addEventListener("load", done);
      quietTimer = setTimeout(done, quiet);
    });
    // Give React a frame to commit any pending transitions.
    await sleep(40);
  }

  snapshot(): Snapshot {
    const doc = this.doc;
    if (!doc) {
      const empty: PageModel = {
        url: this.currentUrl(),
        title: "",
        heading: "",
        headings: [],
        landmarks: [],
        elements: [],
        fields: [],
        actions: [],
        alerts: [],
        dialogs: [],
        tables: [],
        definitions: [],
        fingerprint: "empty",
        capturedAt: Date.now(),
      };
      this.last = { page: empty, elements: new Map() };
      return this.last;
    }
    this.last = snapshotDocument(doc, this.currentUrl());
    return this.last;
  }

  /** Resolve the live element for an action; re-ground semantically when the key vanished. */
  resolve(action: Action): { el: Element; model: SemanticElement; regrounded: boolean; reasons: string[] } | null {
    const snap = this.last ?? this.snapshot();
    if (action.target) {
      const el = snap.elements.get(action.target);
      const model = snap.page.elements.find((e) => e.key === action.target);
      if (el && model && !model.disabled) return { el, model, regrounded: false, reasons: ["exact semantic key"] };
    }
    if (action.targetName) {
      const kind = action.kind === "type" || action.kind === "select" || action.kind === "check" ? "field" : action.kind === "click" || action.kind === "expand" ? "action" : "any";
      const hit = ground(
        {
          name: action.targetName,
          role: action.targetRole,
          kind,
          hints: action.value && !action.value.startsWith("{{") ? [action.value] : undefined,
          commit: action.targetCommit,
          region: action.targetRegion,
        },
        snap.page,
      );
      if (hit) {
        const el = snap.elements.get(hit.element.key);
        if (el) return { el, model: hit.element, regrounded: true, reasons: hit.reasons };
      }
    }
    return null;
  }

  async perform(action: Action): Promise<ActionResult> {
    const started = performance.now();
    const fail = (error: string): ActionResult => ({ ok: false, action, error, durationMs: performance.now() - started });

    if (action.kind === "navigate") {
      if (!action.url) return fail("navigate action without url");
      this.events.onCursor?.(null);
      const page = await this.goto(action.url);
      return { ok: true, action, page, durationMs: performance.now() - started };
    }
    if (action.kind === "wait") {
      await this.waitForSettle(Number(action.value ?? 800));
      return { ok: true, action, page: this.snapshot().page, durationMs: performance.now() - started };
    }

    // Always work from a fresh snapshot so keys reflect the current DOM.
    this.snapshot();
    const resolved = this.resolve(action);
    if (!resolved) {
      this.events.onLog?.(`Could not ground "${action.targetName ?? action.target ?? action.label}"`);
      return fail(`Could not find an element for "${action.targetName ?? action.target ?? action.label}"`);
    }
    const { el, model, regrounded, reasons } = resolved;
    if (regrounded) this.events.onLog?.(`Re-grounded "${action.targetName}" → "${model.name}" (${reasons.join(", ")})`);

    (el as HTMLElement).scrollIntoView?.({ block: "center", inline: "nearest", behavior: "instant" as ScrollBehavior });
    await sleep(30);
    const rect = el.getBoundingClientRect();
    this.events.onCursor?.({ x: rect.left, y: rect.top, w: rect.width, h: rect.height }, action.label);
    if (this.paceMs > 0) await sleep(this.paceMs);

    try {
      switch (action.kind) {
        case "click":
          this.click(el);
          break;
        case "expand": {
          const isExpanded = el.getAttribute("aria-expanded") === "true" || el.getAttribute("aria-selected") === "true";
          if (!isExpanded) this.click(el);
          break;
        }
        case "type":
          this.type(el, action.value ?? "");
          break;
        case "select":
          if (!this.select(el, action.value ?? "")) return fail(`Option "${action.value}" not found in "${model.name}"`);
          break;
        case "check": {
          const desired = action.value !== "false";
          this.check(el, desired);
          break;
        }
        default:
          return fail(`Unsupported action ${action.kind}`);
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }

    await this.waitForSettle(1500);
    const page = this.snapshot().page;
    return {
      ok: true,
      action,
      regrounded,
      regroundedTo: regrounded ? model.key : undefined,
      page,
      durationMs: performance.now() - started,
    };
  }

  // ─────────────── primitive interactions ───────────────

  private click(el: Element) {
    const win = el.ownerDocument.defaultView;
    if (!win) throw new Error("detached element");
    const r = el.getBoundingClientRect();
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      pointerType: "mouse",
      pointerId: 1,
      isPrimary: true,
    };
    const PE = win.PointerEvent ?? win.MouseEvent;
    (el as HTMLElement).focus?.({ preventScroll: true });
    el.dispatchEvent(new PE("pointerdown", init));
    el.dispatchEvent(new win.MouseEvent("mousedown", init));
    el.dispatchEvent(new PE("pointerup", { ...init, buttons: 0 }));
    el.dispatchEvent(new win.MouseEvent("mouseup", { ...init, buttons: 0 }));
    (el as HTMLElement).click();
  }

  private type(el: Element, value: string) {
    const win = el.ownerDocument.defaultView;
    if (!win) throw new Error("detached element");
    const tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea") {
      if (el.getAttribute("contenteditable") === "true") {
        (el as HTMLElement).focus();
        el.textContent = value;
        el.dispatchEvent(new win.InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
        return;
      }
      throw new Error("cannot type into a non-text element");
    }
    const proto = tag === "textarea" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    (el as HTMLElement).focus();
    setter?.call(el, value);
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
    (el as HTMLElement).blur?.();
  }

  private select(el: Element, value: string): boolean {
    const win = el.ownerDocument.defaultView;
    if (!win) throw new Error("detached element");
    const tag = el.tagName.toLowerCase();
    const target = value.trim().toLowerCase();
    if (tag === "select") {
      const select = el as HTMLSelectElement;
      const options = Array.from(select.options);
      const match =
        options.find((o) => o.text.trim().toLowerCase() === target) ??
        options.find((o) => o.value.toLowerCase() === target) ??
        options.find((o) => o.text.trim().toLowerCase().includes(target)) ??
        options.find((o) => target.includes(o.text.trim().toLowerCase()) && o.text.trim().length > 2);
      if (!match) return false;
      const setter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value")?.set;
      (el as HTMLElement).focus();
      setter?.call(select, match.value);
      el.dispatchEvent(new win.Event("input", { bubbles: true }));
      el.dispatchEvent(new win.Event("change", { bubbles: true }));
      return true;
    }
    if (tag === "input" && (el as HTMLInputElement).type === "radio") {
      const input = el as HTMLInputElement;
      const group = input.name
        ? Array.from(el.ownerDocument.querySelectorAll<HTMLInputElement>(`input[type='radio'][name="${CSS.escape(input.name)}"]`))
        : [input];
      const doc = el.ownerDocument;
      const labelOf = (r: HTMLInputElement) =>
        (r.id ? doc.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent : r.closest("label")?.textContent)?.trim().toLowerCase() ?? r.value.toLowerCase();
      const match = group.find((r) => labelOf(r) === target) ?? group.find((r) => labelOf(r).includes(target));
      if (!match) return false;
      this.click(match);
      return true;
    }
    // Text-like element: type the value.
    this.type(el, value);
    return true;
  }

  private check(el: Element, desired: boolean) {
    const tag = el.tagName.toLowerCase();
    const current =
      tag === "input" ? (el as HTMLInputElement).checked : el.getAttribute("aria-checked") === "true" || el.getAttribute("data-state") === "checked";
    if (current !== desired) this.click(el);
  }

  highlight(model: SemanticElement | null, label?: string) {
    if (!model) {
      this.events.onHighlight?.(null);
      return;
    }
    const el = this.last?.elements.get(model.key);
    const r = el ? el.getBoundingClientRect() : null;
    this.events.onHighlight?.(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : (model.rect ?? null), label);
  }

  /** Live rectangle for a semantic key, if the element still exists. */
  rectFor(key: string): ElementRect | null {
    const el = this.last?.elements.get(key);
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
}
