// End-to-end engine test. Run: npm run dev (port 3000) then: node verify/engine.spec.js
// Set CHROMIUM_PATH if Playwright's bundled Chromium is not installed (npx playwright install chromium).
// Set SKIP_V2=1 to skip the vendor-UI-update self-healing pass.
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
  if (!process.env.SKIP_V2) {
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/settings?ui=v2'); });
  const act2 = await page.evaluate(() => window.__synforma.act());
  console.log('ACT V2', JSON.stringify(act2.result), 'regrounded:', act2.events.filter(e => e.type==='action_regrounded').map(e => e.message).join(' | '));
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/settings?ui=v1'); });
  }
  // Observer: start at the lead record, then act like a human
  await page.evaluate(async () => { await window.__synforma.driver.goto('/sandbox/crm/leads/L-1001'); window.__signals = []; window.__observer = window.__synforma.observe((s) => window.__signals.push(s)); });
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Actions' }).click();
  await frame.getByRole('menuitem', { name: 'Convert to opportunity' }).click();
  await page.waitForTimeout(1200);
  await frame.getByLabel('Amount').fill('52000');
  await frame.getByLabel('Expected close date').fill('2026-11-20');
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(1200);
  // hesitate on step 2 (threshold 3000ms in harness)
  await page.waitForTimeout(4200);
  await frame.getByLabel('Decision-maker').selectOption({ label: 'Helen Marsh — VP Operations' });
  await frame.getByLabel('Funding stage').selectOption({ label: 'Approved' });
  await frame.getByLabel('Decision timeline').selectOption({ label: 'This quarter' });
  await frame.getByRole('button', { name: 'Advanced qualification' }).click();
  await frame.getByLabel('None identified').check();
  await frame.getByLabel('Next step', { exact: true }).fill('Discovery call');
  await frame.getByLabel('Next step date').fill('11/20/2026');
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(1200);
  await frame.getByLabel('Next step date').fill('2026-09-12');
  await frame.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(1200);
  await frame.getByRole('button', { name: 'I understand' }).click();
  await frame.getByRole('button', { name: 'Create opportunity' }).click();
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => ({ events: window.__synforma.events, signals: window.__signals }));
  for (const e of out.events) console.log('  ev', e.type, e.stepId ?? '', e.message ?? '', e.type === 'run_completed' ? JSON.stringify(e.data) : '');
  console.log('SIGNALS', JSON.stringify(out.signals));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
