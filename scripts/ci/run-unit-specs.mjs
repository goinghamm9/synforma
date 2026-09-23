#!/usr/bin/env node
/**
 * Runs every unit-level spec in verify/*.spec.ts with tsx and turns their printed results into an exit code.
 *
 * A spec passes when its process exits 0, prints no line that starts with "FAIL", and prints its pass marker
 * ("ALL PASS" or "All checks passed"). Anything else fails the run and prints the tail of that spec's output.
 *
 *   node scripts/ci/run-unit-specs.mjs            # all
 *   node scripts/ci/run-unit-specs.mjs decider    # only specs whose file name contains "decider"
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const filters = process.argv.slice(2);
const specs = readdirSync(path.join(root, "verify"))
  .filter((f) => f.endsWith(".spec.ts"))
  .filter((f) => filters.length === 0 || filters.some((s) => f.includes(s)))
  .sort();

if (specs.length === 0) {
  console.error("No unit specs matched.");
  process.exit(2);
}

let failures = 0;
const rows = [];
for (const spec of specs) {
  const started = Date.now();
  const r = spawnSync(tsx, [path.join("verify", spec)], { cwd: root, encoding: "utf8", env: process.env, timeout: 10 * 60 * 1000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const failLines = out.split("\n").filter((l) => /^FAIL/.test(l));
  const marker = /ALL PASS|All checks passed/.test(out);
  const ok = r.status === 0 && failLines.length === 0 && marker;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const passCount = out.split("\n").filter((l) => /^PASS/.test(l)).length;
  rows.push({ spec, ok, seconds, passCount, failCount: failLines.length, status: r.status });
  if (!ok) {
    failures += 1;
    console.log(`\n──── ${spec}: exit ${r.status}, ${failLines.length} FAIL line(s), pass marker ${marker ? "present" : "missing"} ────`);
    console.log(out.split("\n").slice(-40).join("\n"));
  }
}

console.log("\nUnit specs");
for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.spec.padEnd(28)} ${String(r.passCount).padStart(4)} checks  ${r.failCount ? `${r.failCount} failed  ` : ""}${r.seconds}s`);
console.log(failures ? `\n${failures} spec file(s) failed` : "\nAll unit specs passed");
process.exit(failures ? 1 : 0);
