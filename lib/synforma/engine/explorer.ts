import type { Action, ActionResult, PageModel, SemanticElement, WorkGraph } from "../types";
import type { IframeDriver } from "../interaction/driver";
import { generalizeRoute, pageStateLabel } from "../interaction/snapshot";
import { slug } from "../interaction/text";
import { nodeId, upsertEdge, upsertNode } from "../graph/work-graph";

/**
 * Autonomous discovery.
 *
 * Given nothing but a start URL, the explorer crawls the application through
 * generic semantics: links, menus, tabs, disclosures, multi-step forms and
 * dialogs. It never executes commit actions (create, submit, delete…): discovery
 * never commits. Everything it finds becomes part of the Work Graph.
 */

export interface DiscoveredState {
  id: string;
  label: string;
  route: string;
  url: string;
  page: PageModel;
  /** Replayable actions from the application root to this state. */
  path: Action[];
  depth: number;
  parentId?: string;
  via?: Action;
  /** Elements that had to be expanded to reveal fields on this state (name → field keys). */
  revealed: Record<string, string[]>;
  screenNodeId: string;
}

export type ExploreEvent =
  | { type: "log"; message: string; level?: "info" | "warn" }
  | { type: "state"; state: DiscoveredState }
  | { type: "action"; action: Action; result: ActionResult }
  | { type: "graph"; graph: WorkGraph }
  | { type: "done"; stats: ExploreStats };

export interface ExploreStats {
  screens: number;
  actions: number;
  fields: number;
  objects: number;
  statesVisited: number;
  durationMs: number;
  stoppedBy: "exhausted" | "state-limit" | "time-limit" | "aborted";
}

export interface ExploreOptions {
  driver: IframeDriver;
  startUrl: string;
  appName: string;
  graph: WorkGraph;
  limits?: { maxStates?: number; maxDepth?: number; timeBudgetMs?: number; maxInstancesPerRoute?: number };
  onEvent?: (e: ExploreEvent) => void;
  signal?: AbortSignal;
}

const NEXT_RE = /^(next|continue|proceed)\b/i;
const BACK_RE = /^(back|previous|cancel)\b/i;
const DISMISS_RE = /^(i understand|got it|ok|okay|close|dismiss|cancel|acknowledge|continue|done)\b/i;

function isoDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** Values used only to move through forms during discovery. Never committed. */
export function discoveryValue(field: SemanticElement): string | null {
  const name = field.name.toLowerCase();
  if (field.role === "combobox" || field.role === "radio") {
    const opts = (field.options ?? []).filter((o) => o && !/^(select|choose|--|unknown|none)/i.test(o));
    return opts[0] ?? null;
  }
  if (field.role === "checkbox" || field.role === "switch") return null;
  if (field.inputType === "date" || /date/.test(name)) return isoDate(14);
  if (field.inputType === "number" || /amount|value|quantity|price|revenue/.test(name)) return "25000";
  if (field.inputType === "email") return "discovery@example.com";
  if (field.role === "textarea") return "Entered during Synforma discovery.";
  return "Synforma discovery";
}

export async function explore(opts: ExploreOptions): Promise<{ states: DiscoveredState[]; stats: ExploreStats }> {
  const { driver, startUrl, appName, graph, onEvent } = opts;
  const limits = { maxStates: 40, maxDepth: 5, timeBudgetMs: 120_000, maxInstancesPerRoute: 2, ...(opts.limits ?? {}) };
  const started = performance.now();
  const states = new Map<string, DiscoveredState>();
  const visitedUrls = new Set<string>();
  const instancesPerRoute = new Map<string, number>();
  const queue: { url: string; depth: number; parentId?: string; via?: Action; path: Action[] }[] = [];
  let stoppedBy: ExploreStats["stoppedBy"] = "exhausted";
  const basePath = startUrl.split("?")[0].replace(/\/$/, "");
  const objects = new Set<string>();

  const appId = nodeId("application", appName);
  upsertNode(graph, { id: appId, type: "application", label: appName, status: "confirmed", confidence: 1, data: { baseUrl: startUrl } });
  emit({ type: "graph", graph });

  function emit(e: ExploreEvent) {
    onEvent?.(e);
  }
  function log(message: string, level: "info" | "warn" = "info") {
    emit({ type: "log", message, level });
  }
  function overBudget(): boolean {
    if (opts.signal?.aborted) {
      stoppedBy = "aborted";
      return true;
    }
    if (states.size >= limits.maxStates) {
      stoppedBy = "state-limit";
      return true;
    }
    if (performance.now() - started > limits.timeBudgetMs) {
      stoppedBy = "time-limit";
      return true;
    }
    return false;
  }
  function inApp(href: string): boolean {
    if (!href.startsWith("/")) return false;
    const path = href.split("?")[0].split("#")[0];
    return path === basePath || path.startsWith(basePath + "/");
  }

  function registerState(page: PageModel, path: Action[], depth: number, parentId?: string, via?: Action): DiscoveredState | null {
    if (states.has(page.fingerprint)) return null;
    const route = generalizeRoute(page.url);
    const label = pageStateLabel(page);
    const screenNodeId = nodeId("screen", route, page.dialogs.join(" "), page.fields.length ? (page.fields[0].path.find((p) => /step \d/i.test(p)) ?? "") : "");
    const state: DiscoveredState = {
      id: page.fingerprint,
      label,
      route,
      url: page.url,
      page,
      path,
      depth,
      parentId,
      via,
      revealed: {},
      screenNodeId,
    };
    states.set(state.id, state);

    upsertNode(graph, {
      id: screenNodeId,
      type: "screen",
      label,
      description: page.dialogs.length ? `Dialog on ${route}` : route,
      status: "observed",
      confidence: 0.9,
      data: { route, url: page.url, fingerprint: page.fingerprint, fields: page.fields.length, actions: page.actions.length, dialog: page.dialogs[0] ?? null },
    });
    upsertEdge(graph, appId, screenNodeId, "contains");
    if (parentId) {
      const parent = states.get(parentId);
      if (parent) upsertEdge(graph, parent.screenNodeId, screenNodeId, "navigates_to", via?.label);
    }
    // Fields
    for (const f of page.fields) {
      const fid = nodeId("field", route, f.key);
      upsertNode(graph, {
        id: fid,
        type: "field",
        label: f.name,
        description: [f.role, f.inputType, f.required ? "required" : "", f.region ? `in ${f.region}` : ""].filter(Boolean).join(" · "),
        status: "observed",
        confidence: 0.85,
        data: { key: f.key, role: f.role, inputType: f.inputType ?? null, options: f.options ?? null, required: Boolean(f.required), region: f.region ?? null, path: f.path, screen: screenNodeId },
      });
      upsertEdge(graph, screenNodeId, fid, "contains");
    }
    // Actions (group record links)
    let recordLinkAdded = false;
    for (const a of page.actions) {
      if (a.role === "link" && a.href && generalizeRoute(a.href) !== a.href) {
        if (recordLinkAdded) continue;
        recordLinkAdded = true;
        const aid = nodeId("action", route, "open-record");
        upsertNode(graph, { id: aid, type: "action", label: `Open a record from ${page.heading || route}`, status: "observed", confidence: 0.8, data: { role: "link", pattern: generalizeRoute(a.href), screen: screenNodeId } });
        upsertEdge(graph, screenNodeId, aid, "contains");
        continue;
      }
      if (a.role === "link" && a.href && !inApp(a.href)) continue;
      const aid = nodeId("action", route, a.key);
      upsertNode(graph, {
        id: aid,
        type: "action",
        label: a.name,
        description: [a.role, a.commit ? "commit — never executed during discovery" : "", a.region ? `in ${a.region}` : ""].filter(Boolean).join(" · "),
        status: "observed",
        confidence: 0.85,
        data: { key: a.key, role: a.role, commit: Boolean(a.commit), href: a.href ?? null, region: a.region ?? null, screen: screenNodeId },
      });
      upsertEdge(graph, screenNodeId, aid, "contains");
    }
    // Objects from tables and detail pages
    for (const t of page.tables) {
      const objName = singularize(t.name || page.heading);
      if (!objName) continue;
      const oid = nodeId("object", objName);
      objects.add(oid);
      upsertNode(graph, { id: oid, type: "object", label: objName, description: `Attributes: ${t.headers.join(", ")}`, status: "observed", confidence: 0.75, data: { attributes: t.headers, rows: t.rows } });
      upsertEdge(graph, screenNodeId, oid, "uses", "lists");
    }
    if (page.definitions.length >= 3) {
      const objName = singularize(page.heading ? guessObjectFromRoute(route) : "");
      if (objName) {
        const oid = nodeId("object", objName);
        objects.add(oid);
        upsertNode(graph, { id: oid, type: "object", label: objName, description: `Attributes: ${page.definitions.map((d) => d.label).join(", ")}`, status: "observed", confidence: 0.7, data: { attributes: page.definitions.map((d) => d.label) } });
        upsertEdge(graph, screenNodeId, oid, "uses", "shows");
      }
    }
    emit({ type: "state", state });
    emit({ type: "graph", graph });
    return state;
  }

  async function perform(action: Action): Promise<ActionResult> {
    const result = await driver.perform(action);
    emit({ type: "action", action, result });
    return result;
  }

  async function dismissDialog(page: PageModel): Promise<PageModel> {
    let current = page;
    for (let i = 0; i < 2 && current.dialogs.length; i++) {
      const btn = current.actions.find((a) => a.inDialog && a.role === "button" && !a.commit && DISMISS_RE.test(a.name)) ?? current.actions.find((a) => a.inDialog && a.role === "button" && !a.commit);
      if (!btn) break;
      const r = await perform({ kind: "click", target: btn.key, targetName: btn.name, targetRole: "button", label: `Dismiss "${current.dialogs[0]}" via ${btn.name}` });
      if (r.page) current = r.page;
    }
    return current;
  }

  /** Explore menus, tabs, disclosures and wizard steps within one URL. */
  async function exploreWithin(state: DiscoveredState): Promise<void> {
    let page = state.page;

    // Spontaneous dialog: record it, then dismiss to reach the underlying screen.
    if (page.dialogs.length) {
      const dialogState = state;
      page = await dismissDialog(page);
      const underlying = registerState(page, [...state.path, { kind: "wait", label: "Dismiss dialog" }], state.depth, dialogState.id, { kind: "click", label: `Dismiss "${dialogState.page.dialogs[0]}"` });
      if (underlying) {
        upsertEdge(graph, dialogState.screenNodeId, underlying.screenNodeId, "navigates_to", "dismiss");
        await exploreWithin(underlying);
      }
      return;
    }

    // Links → queue.
    for (const a of page.actions) {
      if (a.role !== "link" || !a.href || !inApp(a.href)) continue;
      const href = a.href.split("#")[0];
      if (href === page.url) continue;
      const pattern = generalizeRoute(href);
      const isInstance = pattern !== href;
      const count = instancesPerRoute.get(pattern) ?? 0;
      if (isInstance && count >= limits.maxInstancesPerRoute) continue;
      if (visitedUrls.has(href) || queue.some((q) => q.url === href)) continue;
      instancesPerRoute.set(pattern, count + 1);
      queue.push({ url: href, depth: state.depth + 1, parentId: state.id, via: { kind: "click", target: a.key, targetName: a.name, targetRole: "link", label: `Open ${a.name}` }, path: [...state.path, { kind: "click", target: a.key, targetName: a.name, targetRole: "link", label: `Open ${a.name}` }] });
    }

    // Disclosures (collapsed sections) → expand, record revealed fields.
    for (const a of page.actions) {
      if (overBudget()) return;
      if (a.role !== "button" || a.expanded !== false || a.commit) continue;
      const hasPopup = driverHasPopup(a);
      if (hasPopup) continue;
      const before = new Set(page.fields.map((f) => f.key));
      const r = await perform({ kind: "expand", target: a.key, targetName: a.name, targetRole: "button", label: `Expand ${a.name}` });
      if (!r.ok || !r.page) continue;
      if (r.page.fingerprint !== page.fingerprint && r.page.url === page.url) {
        const revealed = r.page.fields.filter((f) => !before.has(f.key)).map((f) => f.key);
        if (revealed.length) {
          state.revealed[a.name] = revealed;
          log(`Expanding "${a.name}" revealed ${revealed.length} field(s): ${revealed.map((k) => r.page!.fields.find((f) => f.key === k)?.name).join(", ")}`);
          const actionId = nodeId("action", state.route, a.key);
          upsertNode(graph, { id: actionId, type: "action", label: a.name, description: "disclosure", status: "observed", confidence: 0.85, data: { key: a.key, role: "button", disclosure: true, screen: state.screenNodeId } });
          upsertEdge(graph, state.screenNodeId, actionId, "contains");
          for (const key of revealed) {
            const f = r.page.fields.find((x) => x.key === key)!;
            const fid = nodeId("field", state.route, key);
            upsertNode(graph, { id: fid, type: "field", label: f.name, description: [f.role, f.inputType, `revealed by ${a.name}`].filter(Boolean).join(" · "), status: "observed", confidence: 0.85, data: { key, role: f.role, inputType: f.inputType ?? null, options: f.options ?? null, required: Boolean(f.required), region: f.region ?? null, path: f.path, screen: state.screenNodeId, revealedBy: { name: a.name, role: "button", key: a.key } } });
            upsertEdge(graph, state.screenNodeId, fid, "contains");
            upsertEdge(graph, actionId, fid, "reveals");
          }
          emit({ type: "graph", graph });
        }
        page = r.page;
        state.page = page;
      }
    }

    // Tabs → click each unselected tab; record revealed fields/actions as part of this screen.
    const tabs = page.actions.filter((a) => a.role === "tab");
    for (const tab of tabs) {
      if (overBudget()) return;
      if (tab.expanded) continue;
      const before = new Set(page.fields.map((f) => f.key));
      const r = await perform({ kind: "click", target: tab.key, targetName: tab.name, targetRole: "tab", label: `Open tab ${tab.name}` });
      if (!r.ok || !r.page || r.page.url !== page.url) continue;
      const revealed = r.page.fields.filter((f) => !before.has(f.key)).map((f) => f.key);
      const tabId = nodeId("action", state.route, tab.key);
      upsertNode(graph, { id: tabId, type: "action", label: tab.name, description: "tab", status: "observed", confidence: 0.85, data: { key: tab.key, role: "tab", screen: state.screenNodeId } });
      upsertEdge(graph, state.screenNodeId, tabId, "contains");
      if (revealed.length) {
        state.revealed[tab.name] = revealed;
        log(`Tab "${tab.name}" revealed ${revealed.length} field(s)`);
        for (const key of revealed) {
          const f = r.page.fields.find((x) => x.key === key)!;
          const fid = nodeId("field", state.route, key);
          upsertNode(graph, { id: fid, type: "field", label: f.name, description: [f.role, f.inputType, `in tab ${tab.name}`].filter(Boolean).join(" · "), status: "observed", confidence: 0.85, data: { key, role: f.role, inputType: f.inputType ?? null, options: f.options ?? null, required: Boolean(f.required), region: f.region ?? null, path: f.path, screen: state.screenNodeId, revealedBy: { name: tab.name, role: "tab", key: tab.key } } });
          upsertEdge(graph, state.screenNodeId, fid, "contains");
          upsertEdge(graph, tabId, fid, "reveals");
        }
      }
      // Merge the tab's fields into the state's page so the planner sees everything on this screen.
      const merged = mergePages(state.page, r.page);
      state.page = merged;
      page = merged;
      emit({ type: "graph", graph });
      // Links inside tabs.
      for (const a of r.page.actions) {
        if (a.role !== "link" || !a.href || !inApp(a.href) || a.href === page.url) continue;
        const pattern = generalizeRoute(a.href);
        const isInstance = pattern !== a.href;
        const count = instancesPerRoute.get(pattern) ?? 0;
        if (isInstance && count >= limits.maxInstancesPerRoute) continue;
        if (visitedUrls.has(a.href) || queue.some((q) => q.url === a.href)) continue;
        instancesPerRoute.set(pattern, count + 1);
        queue.push({ url: a.href, depth: state.depth + 1, parentId: state.id, via: { kind: "click", target: a.key, targetName: a.name, targetRole: "link", label: `Open ${a.name}` }, path: [...state.path, { kind: "click", target: tab.key, targetName: tab.name, targetRole: "tab", label: `Open tab ${tab.name}` }, { kind: "click", target: a.key, targetName: a.name, targetRole: "link", label: `Open ${a.name}` }] });
      }
    }

    // Menus → open, enumerate items, try navigational items.
    const menuButtons = page.actions.filter((a) => a.role === "button" && driverHasPopup(a) && !a.commit);
    for (const mb of menuButtons) {
      if (overBudget()) return;
      const opened = await perform({ kind: "click", target: mb.key, targetName: mb.name, targetRole: "button", label: `Open menu ${mb.name}` });
      if (!opened.ok || !opened.page) continue;
      const items = opened.page.actions.filter((a) => a.role === "menuitem");
      if (!items.length) {
        continue;
      }
      const menuActionId = nodeId("action", state.route, mb.key);
      upsertNode(graph, { id: menuActionId, type: "action", label: mb.name, description: `menu with ${items.length} items`, status: "observed", confidence: 0.85, data: { key: mb.key, role: "button", menu: true, screen: state.screenNodeId } });
      upsertEdge(graph, state.screenNodeId, menuActionId, "contains");
      log(`Menu "${mb.name}" contains: ${items.map((i) => i.name).join(", ")}`);
      for (const item of items) {
        const itemId = nodeId("action", state.route, mb.key, item.key);
        upsertNode(graph, { id: itemId, type: "action", label: item.name, description: `menu item in ${mb.name}${item.commit ? " · commit" : ""}`, status: "observed", confidence: 0.85, data: { key: item.key, role: "menuitem", menu: mb.name, menuKey: mb.key, commit: Boolean(item.commit), screen: state.screenNodeId } });
        upsertEdge(graph, menuActionId, itemId, "reveals");
      }
      emit({ type: "graph", graph });
      // Close the menu, then try each item from a clean state.
      await driver.perform({ kind: "wait", label: "settle", value: "200" });
      for (const item of items) {
        if (overBudget()) return;
        if (item.commit) continue;
        // Re-open the menu (menus close after selection).
        const current = driver.snapshot().page;
        if (!current.actions.some((a) => a.role === "menuitem" && a.key === item.key)) {
          const reopen = await perform({ kind: "click", target: mb.key, targetName: mb.name, targetRole: "button", label: `Open menu ${mb.name}` });
          if (!reopen.ok) continue;
        }
        const r = await perform({ kind: "click", target: item.key, targetName: item.name, targetRole: "menuitem", label: `${mb.name} → ${item.name}` });
        if (!r.ok || !r.page) continue;
        const menuPath: Action[] = [...state.path, { kind: "click", target: mb.key, targetName: mb.name, targetRole: "button", label: `Open menu ${mb.name}` }, { kind: "click", target: item.key, targetName: item.name, targetRole: "menuitem", label: `${mb.name} → ${item.name}` }];
        if (r.page.url !== page.url) {
          // Navigated somewhere: register and continue via the queue with the human path.
          const itemId = nodeId("action", state.route, mb.key, item.key);
          const target = registerState(r.page, menuPath, state.depth + 1, state.id, { kind: "click", target: item.key, targetName: item.name, targetRole: "menuitem", label: `${mb.name} → ${item.name}` });
          const targetScreen = target?.screenNodeId ?? states.get(r.page.fingerprint)?.screenNodeId;
          if (targetScreen) upsertEdge(graph, itemId, targetScreen, "navigates_to");
          visitedUrls.add(r.page.url);
          if (target) await exploreWithin(target);
          await driver.goto(page.url);
          page = driver.snapshot().page;
          if (page.dialogs.length) page = await dismissDialog(page);
        } else if (r.page.dialogs.length) {
          const itemId = nodeId("action", state.route, mb.key, item.key);
          const dialogState = registerState(r.page, menuPath, state.depth + 1, state.id, { kind: "click", label: `${mb.name} → ${item.name}` });
          if (dialogState) upsertEdge(graph, itemId, dialogState.screenNodeId, "navigates_to", "opens");
          page = await dismissDialog(r.page);
        } else {
          page = r.page;
        }
      }
    }

    // Wizard: fill and advance through Next/Continue.
    const nextBtn = page.actions.find((a) => a.role === "button" && NEXT_RE.test(a.name) && !a.commit && !a.disabled);
    if (nextBtn && state.depth < limits.maxDepth + 3) {
      const fillActions: Action[] = [];
      for (const f of page.fields) {
        if (f.role === "checkbox" || f.role === "switch") continue;
        const empty = !f.value || /^(select|choose|--)/i.test(f.value);
        if (!f.required && !empty) continue;
        if (!f.required) continue; // Only required fields are needed to advance during discovery.
        const v = discoveryValue(f);
        if (v === null) continue;
        const kind: Action["kind"] = f.role === "combobox" || f.role === "radio" ? "select" : "type";
        const a: Action = { kind, target: f.key, targetName: f.name, targetRole: f.role, value: v, label: `Fill ${f.name} (discovery value)` };
        const r = await perform(a);
        if (r.ok) fillActions.push(a);
      }
      const clickNext: Action = { kind: "click", target: nextBtn.key, targetName: nextBtn.name, targetRole: "button", label: `Click ${nextBtn.name}` };
      let r = await perform(clickNext);
      if (r.ok && r.page && r.page.fingerprint === page.fingerprint && r.page.alerts.length) {
        // Validation stopped us: fill invalid fields with discovery values and retry once.
        log(`Validation on ${state.label}: ${r.page.alerts.join(" / ")}`, "warn");
        for (const f of r.page.fields.filter((x) => x.invalid)) {
          const v = discoveryValue(f);
          if (v === null) continue;
          const kind: Action["kind"] = f.role === "combobox" || f.role === "radio" ? "select" : "type";
          const a: Action = { kind, target: f.key, targetName: f.name, targetRole: f.role, value: v, label: `Fill ${f.name} (discovery value)` };
          const rr = await perform(a);
          if (rr.ok) fillActions.push(a);
        }
        r = await perform(clickNext);
      }
      if (r.ok && r.page && r.page.fingerprint !== page.fingerprint) {
        const nextState = registerState(r.page, [...state.path, ...fillActions, clickNext], state.depth + 1, state.id, clickNext);
        if (nextState) {
          const nextActionId = nodeId("action", state.route, nextBtn.key);
          upsertEdge(graph, nextActionId, nextState.screenNodeId, "navigates_to");
          await exploreWithin(nextState);
        }
      }
    }
  }

  // ─────────────── main loop ───────────────
  queue.push({ url: startUrl, depth: 0, path: [{ kind: "navigate", url: startUrl, label: `Open ${appName}` }] });
  while (queue.length) {
    if (overBudget()) break;
    const item = queue.shift()!;
    if (visitedUrls.has(item.url)) continue;
    if (item.depth > limits.maxDepth) continue;
    visitedUrls.add(item.url);
    log(`Visiting ${item.url}`);
    let page: PageModel;
    try {
      page = await driver.goto(item.url);
    } catch (e) {
      log(`Failed to open ${item.url}: ${e instanceof Error ? e.message : String(e)}`, "warn");
      continue;
    }
    const state = registerState(page, item.path, item.depth, item.parentId, item.via);
    if (!state) continue;
    if (item.parentId && item.via) {
      const parent = states.get(item.parentId);
      if (parent) {
        const parentRoute = parent.route;
        const viaKey = item.via.target;
        if (viaKey) {
          const viaId = generalizeRoute(item.via.targetName ?? "") !== item.via.targetName ? nodeId("action", parentRoute, "open-record") : nodeId("action", parentRoute, viaKey);
          if (graph.nodes.some((n) => n.id === viaId)) upsertEdge(graph, viaId, state.screenNodeId, "navigates_to");
          else {
            const rec = nodeId("action", parentRoute, "open-record");
            if (graph.nodes.some((n) => n.id === rec) && state.route.includes(":id")) upsertEdge(graph, rec, state.screenNodeId, "navigates_to");
          }
        }
      }
    }
    await exploreWithin(state);
  }

  const stats: ExploreStats = {
    screens: graph.nodes.filter((n) => n.type === "screen").length,
    actions: graph.nodes.filter((n) => n.type === "action").length,
    fields: graph.nodes.filter((n) => n.type === "field").length,
    objects: graph.nodes.filter((n) => n.type === "object").length,
    statesVisited: states.size,
    durationMs: performance.now() - started,
    stoppedBy,
  };
  emit({ type: "done", stats });
  return { states: Array.from(states.values()), stats };
}

function driverHasPopup(a: SemanticElement): boolean {
  if (a.popup) return true;
  // Fallback for applications that omit aria-haspopup: menu buttons are usually named Actions/More/Options.
  return a.expanded !== undefined && /\b(actions?|options?|more|menu)\b/i.test(a.name);
}

function mergePages(a: PageModel, b: PageModel): PageModel {
  const keys = new Set(a.elements.map((e) => e.key));
  const extra = b.elements.filter((e) => !keys.has(e.key));
  const elements = [...a.elements, ...extra];
  return {
    ...a,
    elements,
    fields: elements.filter((m) => ["textbox", "textarea", "combobox", "checkbox", "radio", "switch"].includes(m.role)),
    actions: elements.filter((m) => ["button", "link", "menuitem", "tab"].includes(m.role)),
    tables: [...a.tables, ...b.tables.filter((t) => !a.tables.some((x) => x.name === t.name))],
    definitions: [...a.definitions, ...b.definitions.filter((d) => !a.definitions.some((x) => x.label === d.label))],
  };
}

export function singularize(name: string): string {
  const n = name.trim().replace(/^(all|my|recent)\s+/i, "");
  if (!n) return "";
  if (/ies$/i.test(n)) return n.replace(/ies$/i, "y");
  if (/(ses|xes|ches|shes)$/i.test(n)) return n.replace(/es$/i, "");
  if (/s$/i.test(n) && !/ss$/i.test(n)) return n.replace(/s$/i, "");
  return n;
}

function guessObjectFromRoute(route: string): string {
  const segs = route.split("?")[0].split("/").filter(Boolean);
  const idx = segs.indexOf(":id");
  if (idx > 0) return capitalize(singularize(segs[idx - 1]));
  return "";
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export { slug as slugify };
