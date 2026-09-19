// Trust-epic test: evidence claims and contradictions (→ STOP), Autonomy Contract decisions per step,
// provenance ledger with undo of reversible fills, Get It Done (routine only), expert demonstration → reconstructed
// workflow → execution, and skill status. Run: npm run dev (port 3000) then: node verify/epics.spec.js
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
  // 1. Evidence
  const claims = await page.evaluate(() => window.__synforma.claims());
  console.log('CLAIMS report:', JSON.stringify(claims.report.byAuthority), 'contested:', claims.report.contested.length);
  console.log('  sample:', claims.sample.join('\n          '));
  console.log('  belief r2:', JSON.stringify(claims.belief));
  // 2. Trust with default contract
  const trust = await page.evaluate(() => window.__synforma.trust());
  console.log('CONTRACT:', trust.contract.join(' | '));
  for (const s of trust.steps) console.log('  TRUST', s.step, '→', s.decision, s.actionClass, 'risk', s.risk.toFixed(2), '|', s.reasons[s.reasons.length - 1]);
  // 3. Act with trust + ledger
  const act = await page.evaluate(() => window.__synforma.act(undefined, true, { useTrust: true }));
  console.log('ACT(trust) result:', JSON.stringify(act.result), '| trust events:', act.events.filter((e) => e.type === 'trust_decision').map((e) => e.message).join(', '));
  console.log('LEDGER entries:', act.ledger.length, '| reversible:', act.ledger.filter((e) => e.rollback.possible).length, '| sample:', JSON.stringify(act.ledger.find((e) => e.before && e.after)?.action.label), JSON.stringify(act.ledger.find((e) => e.before && e.after)?.before), '→', JSON.stringify(act.ledger.find((e) => e.before && e.after)?.after));
  console.log('RECAP:', JSON.stringify(await page.evaluate(() => window.__synforma.recap())).slice(0, 300));
  // 4. Get It Done (routineOnly) + rollback of fills
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/settings?ui=v1'); });
  const gid = await page.evaluate(() => window.__synforma.act(undefined, true, { routineOnly: true }));
  console.log('GET IT DONE result:', JSON.stringify(gid.result), '| notes:', gid.events.filter((e) => e.type === 'note').map((e) => e.message).join(' | '));
  console.log('  fields after GID:', JSON.stringify(await page.evaluate(() => window.__synforma.driver.snapshot().page.fields.map((f) => `${f.name}=${f.value ?? (f.checked ? 'checked' : '')}`))).slice(0, 600));
  const rb = await page.evaluate(() => window.__synforma.rollback());
  console.log('ROLLBACK restored', rb.restored, 'skipped', rb.skipped, '| fields now:', JSON.stringify(rb.page).slice(0, 700));
  // 5. Contradiction → STOP
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/settings?ui=v1'); });
  const rp = await page.evaluate(() => window.__synforma.replan(`I want account executives to create a properly qualified opportunity in this system from an inbound lead.\n\nA properly qualified opportunity must have:\n1. A named decision-maker contact\n2. Budget status confirmed (Signed or Countersigned)\n3. A decision timeline (not Unknown)\n4. Competitors recorded, or "None identified"\n5. A next step scheduled within 14 days`));
  const c2 = await page.evaluate(() => window.__synforma.claims());
  console.log('CONTRADICTION test — contested:', JSON.stringify(c2.contested));
  const t2 = await page.evaluate(() => window.__synforma.trust());
  console.log('  trust on Qualification:', JSON.stringify(t2.steps.find((s) => /qualif/i.test(s.step))));
  const act2 = await page.evaluate(() => window.__synforma.act(undefined, true, { useTrust: true }));
  console.log('  ACT with conflicting sources →', JSON.stringify(act2.result));
  // 6. Demonstration: a person performs it once; Synforma reconstructs and then performs the reconstructed workflow
  await page.evaluate(() => window.__synforma.plan());
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/leads/L-1001'); window.__synforma.startRecording(); });
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Actions' }).click();
  await frame.getByRole('menuitem', { name: 'Convert to opportunity' }).click();
  await page.waitForTimeout(700);
  await frame.getByLabel('Amount').fill('61000');
  await frame.getByLabel('Expected close date').fill('2026-12-01');
  await frame.getByLabel('Stage').selectOption({ label: 'Qualification' });
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(700);
  await frame.getByLabel('Decision-maker').selectOption({ label: 'Helen Marsh — VP Operations' });
  await frame.getByLabel('Funding stage').selectOption({ label: 'Allocated' });
  await frame.getByLabel('Decision timeline').selectOption({ label: 'This quarter' });
  await frame.getByRole('button', { name: 'Advanced qualification' }).click();
  await frame.getByLabel('Northwind Systems').check();
  await frame.getByLabel('Next step', { exact: true }).fill('Site walkthrough');
  await frame.getByLabel('Next step date').fill('2026-09-15');
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(700);
  await frame.getByRole('button', { name: 'I understand' }).click();
  await frame.getByRole('button', { name: 'Create opportunity' }).click();
  await page.waitForTimeout(1500);
  const rec = await page.evaluate(() => window.__synforma.reconstruct());
  console.log('DEMONSTRATION trace', rec.traceCount, '|', rec.summary, '| version', rec.version);
  for (const s of rec.steps) console.log('   ', s);
  console.log('  questions:', JSON.stringify(rec.questions));
  console.log('  deviations:', JSON.stringify(rec.deviations));
  const leak = JSON.stringify(rec).includes('61000') || JSON.stringify(rec).includes('Site walkthrough');
  console.log('  privacy (typed values in reconstruction):', leak);
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/settings?ui=v1'); });
  const act3 = await page.evaluate(() => window.__synforma.act(undefined, true, { workflowOverride: window.__synforma.demonstrated }));
  console.log('ACT reconstructed workflow →', JSON.stringify(act3.result));
  console.log('SKILL:', JSON.stringify(await page.evaluate(() => window.__synforma.skill())));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
