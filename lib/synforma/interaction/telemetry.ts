import type { ElementRect, KeyboardWindow, PointerWindow } from "../types";

/**
 * Interaction telemetry — local feature extraction.
 *
 * Raw pointer movement never leaves the client: it is reduced to short
 * feature windows (distance, path efficiency, direction changes, hover dwell
 * by semantic element, approaches/withdrawals relative to the current target).
 *
 * Keyboard capture records METADATA only. The key value is classified into a
 * category and discarded immediately. Password, secret, card and similar
 * fields emit nothing but a suppressed count. See docs/PRIVACY_MODEL.md.
 */

interface Sample {
  x: number;
  y: number;
  t: number;
}

export interface PointerAggregatorOptions {
  doc: Document;
  windowMs?: number;
  /** Semantic key → live element from the latest snapshot (used for hover attribution). */
  getElements: () => Map<string, Element>;
  /** Names for keys (for readable hover targets). */
  getName?: (key: string) => string;
  /** Current target (the control the workflow step points at), if any. */
  getTarget: () => { key: string; rect: ElementRect } | null;
  onWindow: (w: PointerWindow) => void;
}

const INTERACTIVE = "a[href],button,input,select,textarea,[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='combobox'],[role='option'],summary";

export class PointerAggregator {
  private samples: Sample[] = [];
  private clicks = 0;
  private lastSampleT = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hover = new Map<string, number>();
  private lastHoverKey: string | null = null;
  private lastHoverT = 0;
  private targetHoverMs = 0;
  private targetSeen = false;
  private approaches = 0;
  private withdrawals = 0;
  private lastDist: number | null = null;
  private trend: "in" | "out" | null = null;
  private trendStart = 0;
  private readonly windowMs: number;
  private readonly onMove = (e: PointerEvent) => {
    const t = performance.now();
    if (t - this.lastSampleT < 33) return; // ≈30 Hz cap
    this.lastSampleT = t;
    this.samples.push({ x: e.clientX, y: e.clientY, t });
    if (this.samples.length > 120) this.samples.shift();
    this.attributeHover(e, t);
    this.trackTarget(e);
  };
  private readonly onDown = () => {
    this.clicks += 1;
  };

  constructor(private readonly opts: PointerAggregatorOptions) {
    this.windowMs = opts.windowMs ?? 1000;
  }

  start() {
    if (this.timer) return;
    this.opts.doc.addEventListener("pointermove", this.onMove, { passive: true, capture: true });
    this.opts.doc.addEventListener("pointerdown", this.onDown, { passive: true, capture: true });
    this.timer = setInterval(() => this.flush(), this.windowMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.opts.doc.removeEventListener("pointermove", this.onMove, { capture: true });
    this.opts.doc.removeEventListener("pointerdown", this.onDown, { capture: true });
  }

  /** Reset target-relative accumulators (call when the step / target changes). */
  resetTarget() {
    this.targetHoverMs = 0;
    this.targetSeen = false;
    this.approaches = 0;
    this.withdrawals = 0;
    this.lastDist = null;
    this.trend = null;
    this.nearTarget = false;
  }

  private attributeHover(e: PointerEvent, t: number) {
    const doc = this.opts.doc;
    let el: Element | null = null;
    try {
      el = doc.elementFromPoint(e.clientX, e.clientY);
    } catch {
      el = null;
    }
    const interactive = el?.closest(INTERACTIVE) ?? null;
    let key: string | null = null;
    if (interactive) {
      for (const [k, node] of this.opts.getElements()) {
        if (node === interactive) {
          key = k;
          break;
        }
      }
    }
    if (this.lastHoverKey && this.lastHoverT) {
      const dwell = Math.min(400, t - this.lastHoverT);
      this.hover.set(this.lastHoverKey, (this.hover.get(this.lastHoverKey) ?? 0) + dwell);
      const target = this.opts.getTarget();
      if (target && this.lastHoverKey === target.key) {
        this.targetHoverMs += dwell;
        if (this.targetHoverMs >= 400) this.targetSeen = true;
      }
    }
    this.lastHoverKey = key;
    this.lastHoverT = t;
  }

  private nearTarget = false;

  /** Distance from the pointer to the target's rectangle edge (0 when inside). */
  private trackTarget(e: PointerEvent) {
    const target = this.opts.getTarget();
    if (!target) return;
    const r = target.rect;
    const dx = Math.max(r.x - e.clientX, 0, e.clientX - (r.x + r.w));
    const dy = Math.max(r.y - e.clientY, 0, e.clientY - (r.y + r.h));
    const d = Math.hypot(dx, dy);
    // An approach is counted when the pointer comes within 40px of the control, a withdrawal when it then leaves by more than 120px.
    if (d <= 40) {
      if (!this.nearTarget) {
        this.nearTarget = true;
        this.approaches += 1;
      }
    } else if (d > 120 && this.nearTarget) {
      this.nearTarget = false;
      this.withdrawals += 1;
    }
    this.lastDist = d;
  }

  private flush() {
    const now = performance.now();
    const windowStart = now - this.windowMs;
    const inWindow = this.samples.filter((s) => s.t >= windowStart);
    let distance = 0;
    let maxV = 0;
    let directionChanges = 0;
    let prevAngle: number | null = null;
    for (let i = 1; i < inWindow.length; i++) {
      const a = inWindow[i - 1];
      const b = inWindow[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const seg = Math.hypot(dx, dy);
      distance += seg;
      const dt = Math.max(1, b.t - a.t);
      maxV = Math.max(maxV, (seg / dt) * 1000);
      if (seg >= 4) {
        const angle = Math.atan2(dy, dx);
        if (prevAngle !== null) {
          let diff = Math.abs(angle - prevAngle);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          if (diff > Math.PI / 4) directionChanges += 1;
        }
        prevAngle = angle;
      }
    }
    const first = inWindow[0];
    const last = inWindow[inWindow.length - 1];
    const straight = first && last ? Math.hypot(last.x - first.x, last.y - first.y) : 0;
    const spanMs = first && last ? Math.max(1, last.t - first.t) : 0;
    const hoverTargets = Array.from(this.hover.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, dwellMs]) => ({ key, name: this.opts.getName?.(key) ?? key, dwellMs: Math.round(dwellMs) }));
    const w: PointerWindow = {
      durationMs: this.windowMs,
      sampleCount: inWindow.length,
      distancePx: Math.round(distance),
      straightLineDistancePx: Math.round(straight),
      pathEfficiency: distance > 0 ? Math.min(1, straight / distance) : 1,
      meanVelocityPxS: spanMs > 0 ? Math.round((distance / spanMs) * 1000) : 0,
      maxVelocityPxS: Math.round(maxV),
      directionChanges,
      targetApproaches: this.approaches,
      targetWithdrawals: this.withdrawals,
      targetHoverMs: Math.round(this.targetHoverMs),
      targetSeen: this.targetSeen,
      hoverTargets,
      clicks: this.clicks,
      idleMs: Math.round(now - (this.lastSampleT || now)),
    };
    this.clicks = 0;
    this.hover.clear();
    this.opts.onWindow(w);
  }
}

// ───────────────────────────── keyboard metadata ─────────────────────────────

export type KeyCategory = "character" | "backspace" | "enter" | "escape" | "shortcut" | "navigation";

const SENSITIVE_FIELD_RE = /(password|passwd|secret|token|api[-_ ]?key|ssn|social|card|cvv|cvc|iban|account[-_ ]?number|routing)/i;

/** True when keystrokes in this element must never be observed, even as metadata. */
export function isSensitiveField(el: Element | null): boolean {
  if (!el) return false;
  const input = el as HTMLInputElement;
  const type = (input.type ?? "").toLowerCase();
  if (type === "password") return true;
  const auto = (input.autocomplete ?? "").toLowerCase();
  if (auto.includes("password") || auto.startsWith("cc-") || auto === "one-time-code") return true;
  const hint = `${input.name ?? ""} ${input.id ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`;
  if (SENSITIVE_FIELD_RE.test(hint)) return true;
  const label = input.id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent ?? "" : "";
  return SENSITIVE_FIELD_RE.test(label);
}

export function classifyKey(e: KeyboardEvent): KeyCategory {
  if (e.key === "Backspace" || e.key === "Delete") return "backspace";
  if (e.key === "Enter") return "enter";
  if (e.key === "Escape") return "escape";
  if (e.ctrlKey || e.metaKey || e.altKey) return "shortcut";
  if (e.key.length === 1) return "character";
  return "navigation";
}

export interface KeyboardAggregatorOptions {
  doc: Document;
  windowMs?: number;
  onWindow: (w: KeyboardWindow) => void;
}

export class KeyboardAggregator {
  private timestamps: number[] = [];
  private counts: Record<KeyCategory, number> = { character: 0, backspace: 0, enter: 0, escape: 0, shortcut: 0, navigation: 0 };
  private suppressed = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly windowMs: number;
  private readonly onKey = (e: KeyboardEvent) => {
    // Sensitive fields: count only that something was suppressed. Never inspect the key.
    if (isSensitiveField(e.target as Element | null)) {
      this.suppressed += 1;
      return;
    }
    const category = classifyKey(e);
    // The key value is not retained anywhere beyond this point.
    this.counts[category] += 1;
    this.timestamps.push(performance.now());
  };

  constructor(private readonly opts: KeyboardAggregatorOptions) {
    this.windowMs = opts.windowMs ?? 1000;
  }

  start() {
    if (this.timer) return;
    this.opts.doc.addEventListener("keydown", this.onKey, { capture: true, passive: true });
    this.timer = setInterval(() => this.flush(), this.windowMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.opts.doc.removeEventListener("keydown", this.onKey, { capture: true });
  }

  private flush() {
    const total = Object.values(this.counts).reduce((a, b) => a + b, 0);
    if (total === 0 && this.suppressed === 0) return;
    const intervals: number[] = [];
    for (let i = 1; i < this.timestamps.length; i++) intervals.push(this.timestamps[i] - this.timestamps[i - 1]);
    intervals.sort((a, b) => a - b);
    const median = intervals.length ? intervals[Math.floor(intervals.length / 2)] : null;
    let bursts = this.timestamps.length ? 1 : 0;
    for (const iv of intervals) if (iv > 700) bursts += 1;
    const w: KeyboardWindow = {
      durationMs: this.windowMs,
      keyCount: total,
      characterCount: this.counts.character,
      backspaceCount: this.counts.backspace,
      enterCount: this.counts.enter,
      escapeCount: this.counts.escape,
      shortcutCount: this.counts.shortcut,
      navigationCount: this.counts.navigation,
      medianInterKeyMs: median === null ? null : Math.round(median),
      typingBursts: bursts,
      suppressedCount: this.suppressed,
    };
    this.counts = { character: 0, backspace: 0, enter: 0, escape: 0, shortcut: 0, navigation: 0 };
    this.timestamps = [];
    this.suppressed = 0;
    this.opts.onWindow(w);
  }
}

/** Provider interface for optional, opt-in gaze adapters. Nothing implements it in this build; nothing is collected. */
export interface GazeFeatureWindow {
  durationMs: number;
  validSampleRatio: number;
  fixationCount: number;
  aois: { key: string; dwellMs: number; fixationCount: number; revisitCount: number }[];
}
export interface GazeProvider {
  readonly id: string;
  /** Must be explicitly enabled by the person; UI must show an active indicator. */
  start(onWindow: (w: GazeFeatureWindow) => void): Promise<void>;
  stop(): Promise<void>;
}
