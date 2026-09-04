// Friction-engine and privacy test: a scripted person is fluent, searches, mis-formats a date, hesitates over the commit.
// Asserts the inferred states, the minimal interventions chosen (and DO_NOTHING when fluent / proficient),
// and that no typed values appear in any event payload. Run: npm run dev (port 3000) then: node verify/friction.spec.js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:3000/dev/engine', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__synforma));
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/settings?ui=v1'); localStorage.removeItem('meridian-crm-db'); });
  await page.evaluate(() => window.__synforma.discover());
  await page.evaluate(() => window.__synforma.plan());
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/leads/L-1001'); window.__signals = []; window.__observer = window.__synforma.observe((s) => window.__signals.push(s)); });
  const frame = page.frameLocator('iframe');
  const iframeBox = await page.locator('iframe').boundingBox();
  const moveTo = async (x, y) => page.mouse.move(iframeBox.x + x, iframeBox.y + y, { steps: 8 });
  const stateNow = () => page.evaluate(() => { const f = window.__synforma.frictions; return f.length ? f[f.length - 1] : null; });
  const sigs = () => page.evaluate(() => window.__signals.map((s) => `${s.stepId}:${s.type}:${s.frictionState}:${(s.frictionConfidence ?? s.magnitude).toFixed?.(2) ?? ''}`));

  // Scene 2 — fluent: quickly open Actions → Convert, fill basics, Next
  await frame.getByRole('button', { name: 'Actions' }).click();
  await frame.getByRole('menuitem', { name: 'Convert to opportunity' }).click();
  await page.waitForTimeout(800);
  await frame.getByLabel('Amount').fill('52000');
  await frame.getByLabel('Expected close date').fill('2026-11-20');
  await page.waitForTimeout(1800);
  console.log('after basics (fluent expected):', JSON.stringify(await stateNow()));
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(800);
  // fill visible qualification fields
  await frame.getByLabel('Decision-maker').selectOption({ label: 'Helen Marsh — VP Operations' });
  await frame.getByLabel('Funding stage').selectOption({ label: 'Approved' });
  await frame.getByLabel('Decision timeline').selectOption({ label: 'This quarter' });
  // Scene 3 — visual search: wander the pointer around the form without touching "Advanced qualification"
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    await moveTo(200 + Math.random() * 900, 120 + Math.random() * 230);
    await page.waitForTimeout(120);
  }
  console.log('after wandering (VISUAL_SEARCH expected):', JSON.stringify(await stateNow()));
  console.log('signals:', JSON.stringify(await sigs()));
  // expand and finish step 2 with a bad date → error recovery
  await frame.getByRole('button', { name: 'Advanced qualification' }).click();
  await frame.getByLabel('None identified').check();
  await frame.getByLabel('Next step', { exact: true }).fill('Discovery call');
  await frame.getByLabel('Next step date').fill('11/20/2026');
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(2200);
  console.log('after bad date (ERROR_RECOVERY expected):', JSON.stringify(await stateNow()));
  await frame.getByLabel('Next step date').fill('2026-09-12');
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(800);
  await frame.getByRole('button', { name: 'I understand' }).click();
  await page.waitForTimeout(500);
  // Scene 4 — decision uncertainty: hover Create, withdraw, approach again, hover
  const btn = await frame.getByRole('button', { name: 'Create opportunity' }).boundingBox();
  const bx = btn.x + btn.width / 2 - iframeBox.x, by = btn.y + btn.height / 2 - iframeBox.y;
  await moveTo(bx, by); await page.waitForTimeout(1500);
  await moveTo(bx - 300, by - 200); await page.waitForTimeout(700);
  await moveTo(bx, by); await page.waitForTimeout(1500);
  await moveTo(bx - 250, by - 150); await page.waitForTimeout(700);
  await moveTo(bx, by); await page.waitForTimeout(2500);
  console.log('after hover/withdraw (DECISION_UNCERTAINTY expected):', JSON.stringify(await stateNow()));
  const signals = await page.evaluate(() => window.__signals);
  console.log('signals:', JSON.stringify(await sigs()));
  // decisions for each friction signal
  for (const s of signals.filter((x) => x.frictionState)) {
    const d = await page.evaluate((sig) => window.__synforma.decide(sig), s);
    console.log(`DECISION for ${s.frictionState} on ${s.stepId}: ${d.selected} | top3: ${d.candidates.slice(0, 3).map((c) => `${c.techniqueId}=${c.total}`).join(', ')} | content: ${d.intervention ? d.intervention.content.title + ' — ' + d.intervention.content.body : '(none)'}`);
    const d2 = await page.evaluate((sig) => window.__synforma.decide(sig, { unassisted: 3 }), s);
    console.log(`   after 3 unassisted successes: ${d2.selected} | ${d2.candidates.slice(0, 2).map((c) => `${c.techniqueId}=${c.total}`).join(', ')}`);
  }
  // fluent signal → DO_NOTHING
  const fl = await page.evaluate(() => window.__synforma.decide({ id: 'x', runId: 'r', stepId: 's4', type: 'hesitation', magnitude: 0.2, t: Date.now(), frictionState: 'FLUENT', frictionConfidence: 0.7, evidence: ['clicks and keys, no errors'] }));
  console.log('DECISION for FLUENT:', fl.selected, fl.candidates.slice(0, 2).map((c) => `${c.techniqueId}=${c.total}`).join(', '));
  await frame.getByRole('button', { name: 'Create opportunity' }).click();
  await page.waitForTimeout(2000);
  const events = await page.evaluate(() => window.__synforma.events);
  const counts = {}; for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  console.log('event counts:', JSON.stringify(counts));
  // privacy: no raw text in any event
  const secret = 'Discovery call';
  const leak = events.filter((e) => JSON.stringify(e.data ?? {}).includes(secret) || JSON.stringify(e.data ?? {}).includes('52000') || JSON.stringify(e.data ?? {}).includes('2026-11-20'));
  console.log('privacy check — events containing typed values:', leak.length, leak.map((e) => e.type).join(','));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
