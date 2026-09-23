#!/usr/bin/env node
/**
 * Runs the browser specs in verify/*.spec.js against a production server and turns their printed results into
 * an exit code, so that CI and a laptop judge them the same way.
 *
 * The specs print PASS / FAIL lines (some exit non-zero on failure, some do not). A spec passes when its
 * process exits 0, prints no line that starts with "FAIL", matches every `expect` pattern of its manifest
 * entry and none of its `forbid` patterns. Logs go to .verify/logs/<name>.log.
 *
 *   node scripts/ci/run-e2e.mjs                     # every spec, sequentially, against `next start` on :3000
 *   node scripts/ci/run-e2e.mjs --shard 2/4         # one shard of a time-balanced split (CI matrix)
 *   node scripts/ci/run-e2e.mjs --only targets,graph
 *   node scripts/ci/run-e2e.mjs --standalone        # serve .next/standalone/server.js (the container's entry point)
 *   node scripts/ci/run-e2e.mjs --base http://host:port   # a server that is already running; none is started
 *
 * Requires a build (`npm run build`, or SYNFORMA_STANDALONE=1 for --standalone) and a Chromium: Playwright's
 * (`npx playwright install --with-deps chromium`) or the one CHROMIUM_PATH points at.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every browser spec, its usual duration in minutes (for shard balance) and what its output must and must not say. */
const MANIFEST = [
  { name: "targets", file: "targets.spec.js", minutes: 11, expect: [/^PASS: all targets 5\/5/m] },
  { name: "decider-browser", file: "decider-browser.spec.js", minutes: 10, expect: [/^ALL PASS/m] },
  { name: "employee", file: "employee.spec.js", minutes: 5 },
  { name: "demo-advanced", file: "demo-advanced.spec.js", minutes: 4 },
  { name: "demo-simple", file: "demo-simple.spec.js", minutes: 3 },
  { name: "demo-trust", file: "demo-trust.spec.js", minutes: 3 },
  { name: "connect-resilience", file: "connect-resilience.spec.js", minutes: 3, expect: [/^ALL PASS/m] },
  { name: "epics", file: "epics.spec.js", minutes: 3, expect: [/ACT with conflicting sources → \{"outcome":"abandoned"/, /ACT reconstructed workflow → \{"outcome":"completed"/, /privacy \(typed values in reconstruction\): false/], forbid: [/\[pageerror\]/] },
  { name: "employee-guide", file: "employee-guide.spec.js", minutes: 2 },
  { name: "engine", file: "engine.spec.js", minutes: 2, expect: [/ACT V2 \{"outcome":"completed"/], forbid: [/\[pageerror\]/] },
  { name: "friction", file: "friction.spec.js", minutes: 2, expect: [/DECISION for FLUENT: do_nothing/, /after 3 unassisted successes: do_nothing/, /privacy check — events containing typed values: 0/], forbid: [/\[pageerror\]/] },
  { name: "demo-trust-extra", file: "demo-trust-extra.spec.js", minutes: 2 },
  { name: "graph", file: "graph.spec.js", minutes: 1 },
  { name: "stimulus", file: "stimulus.spec.js", minutes: 1 },
  { name: "sandbox-assistant", file: "sandbox-assistant.spec.js", minutes: 1 },
  { name: "sandbox-billing", file: "sandbox-billing.spec.js", minutes: 1 },
  { name: "sandbox-data", file: "sandbox-data.spec.js", minutes: 1 },
  { name: "sandbox-erp", file: "sandbox-erp.spec.js", minutes: 1 },
];

const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (flag) => args.includes(flag);
const shardSpec = opt("--shard");
const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const standalone = has("--standalone");
const baseArg = opt("--base");
const port = Number(process.env.PORT || 3000);
const base = baseArg ?? `http://localhost:${port}`;

let selected = MANIFEST;
if (only?.length) selected = MANIFEST.filter((m) => only.some((o) => m.name === o || m.file.includes(o)));
if (shardSpec) {
  const [i, n] = shardSpec.split("/").map(Number);
  if (!(i >= 1 && n >= 1 && i <= n)) {
    console.error(`Bad --shard "${shardSpec}"; expected i/n with 1 <= i <= n.`);
    process.exit(2);
  }
  // Greedy time balance: longest first, each into the shard with the least work so far. Deterministic.
  const buckets = Array.from({ length: n }, () => ({ minutes: 0, specs: [] }));
  for (const m of [...selected].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))) {
    const b = buckets.reduce((best, cur) => (cur.minutes < best.minutes ? cur : best));
    b.minutes += m.minutes;
    b.specs.push(m);
  }
  selected = buckets[i - 1].specs;
  console.log(`Shard ${i}/${n}: ${selected.map((m) => m.name).join(", ") || "(empty)"} (~${buckets[i - 1].minutes} min)`);
}
if (selected.length === 0) {
  console.log("No specs selected.");
  process.exit(0);
}

const logDir = path.join(root, ".verify", "logs");
mkdirSync(logDir, { recursive: true });

async function waitForServer(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let server = null;
/** The standalone server serves assets from its own directory: give it .next/static and public, as the Dockerfile does. */
function assembleStandalone() {
  const dir = path.join(root, ".next", "standalone");
  if (!existsSync(path.join(dir, "server.js"))) {
    console.error("No .next/standalone/server.js: build with SYNFORMA_STANDALONE=1 npm run build first.");
    process.exit(2);
  }
  cpSync(path.join(root, ".next", "static"), path.join(dir, ".next", "static"), { recursive: true });
  cpSync(path.join(root, "public"), path.join(dir, "public"), { recursive: true });
  return dir;
}
async function startServer() {
  const cmd = standalone ? [process.execPath, [path.join(assembleStandalone(), "server.js")]] : [process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)]];
  server = spawn(cmd[0], cmd[1], { cwd: root, env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  server.stdout.on("data", (d) => chunks.push(d));
  server.stderr.on("data", (d) => chunks.push(d));
  const up = await waitForServer(`${base}/api/planner/status`, 90_000);
  writeFileSync(path.join(logDir, "server.log"), Buffer.concat(chunks));
  if (!up) {
    console.error(`The server did not answer on ${base} within 90 s. Its output:\n${Buffer.concat(chunks).toString().slice(-2000)}`);
    stopServer();
    process.exit(2);
  }
  console.log(`Server up on ${base} (${standalone ? "standalone" : "next start"})`);
}
function stopServer() {
  if (!server) return;
  server.kill("SIGTERM");
  server = null;
}

function runSpec(m) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timeoutMs = Math.max(10, m.minutes * 3 + 5) * 60_000;
    const child = spawn(process.execPath, [path.join("verify", m.file)], { cwd: root, env: { ...process.env, BASE_URL: base }, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => chunks.push(d));
    const timer = setTimeout(() => {
      chunks.push(Buffer.from(`\n[runner] timed out after ${timeoutMs / 60_000} minutes\n`));
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks).toString();
      writeFileSync(path.join(logDir, `${m.name}.log`), out);
      const lines = out.split("\n");
      const passCount = lines.filter((l) => /^PASS/.test(l)).length;
      const failLines = lines.filter((l) => /^FAIL/.test(l));
      const missing = (m.expect ?? []).filter((re) => !re.test(out)).map(String);
      const forbidden = (m.forbid ?? []).filter((re) => re.test(out)).map(String);
      const ok = code === 0 && failLines.length === 0 && missing.length === 0 && forbidden.length === 0;
      resolve({ ...m, ok, code, passCount, failLines, missing, forbidden, seconds: Math.round((Date.now() - started) / 1000), out });
    });
  });
}

(async () => {
  if (!baseArg) await startServer();
  const results = [];
  for (const m of selected) {
    process.stdout.write(`▶ ${m.name} … `);
    const r = await runSpec(m);
    results.push(r);
    console.log(`${r.ok ? "PASS" : "FAIL"} (${r.passCount} checks, ${r.seconds}s)`);
    if (!r.ok) {
      if (r.failLines.length) console.log(r.failLines.map((l) => `  ${l.slice(0, 300)}`).join("\n"));
      if (r.missing.length) console.log(`  expected output missing: ${r.missing.join(" ; ")}`);
      if (r.forbidden.length) console.log(`  forbidden output present: ${r.forbidden.join(" ; ")}`);
      if (r.code !== 0) console.log(`  exit code ${r.code}; last lines:\n${r.out.split("\n").slice(-15).map((l) => `    ${l.slice(0, 200)}`).join("\n")}`);
    }
  }
  stopServer();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nEnd-to-end: ${results.length - failed.length}/${results.length} spec files passed, ${results.reduce((s, r) => s + r.passCount, 0)} checks, ${Math.round(results.reduce((s, r) => s + r.seconds, 0) / 60)} min. Logs in .verify/logs/`);
  if (failed.length) console.log(`Failed: ${failed.map((r) => r.name).join(", ")}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  stopServer();
  process.exit(2);
});
