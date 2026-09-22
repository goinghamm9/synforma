// A stand-in for Jev served from the browser (Playwright route), so the decision path can be exercised without
// credentials. Answers "none_of_these" unless an option's description shares at least 60% of the expected
// name's words, or the test's answer key names the control it renamed on purpose. Same reply shape as /api/decide.
const STATUS = { configured: true, provider: "jev", model: "typesafe/jev", via: "cloudflare" };
const PROBE = { ok: true, latencyMs: 180, route: "catalog", model: "jev-1.13", detail: 'chose "Budget confirmation" (combobox; options: Requested, Approved, Allocated) with p 0.93, confidence 0.81 (the expected answer)' };
const tokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);

function oracle(body, answerKey) {
  const q = body.questions && body.questions.field;
  if (!q) return null;
  const expected = (/knew as "([^"]+)"/.exec(body.state || "") || [])[1] || "";
  const labels = Object.keys(q.criteria);
  let choice = "none_of_these";
  const wanted = answerKey[expected];
  if (wanted) {
    const hit = labels.find((l) => typeof q.criteria[l] === "string" && q.criteria[l].includes(`"${wanted}"`));
    if (hit) choice = hit;
  } else {
    const et = tokens(expected);
    let best = null;
    for (const l of labels) {
      if (l === "none_of_these") continue;
      const dt = new Set(tokens(q.criteria[l] || ""));
      const overlap = et.filter((t) => dt.has(t)).length / Math.max(1, et.length);
      if (overlap >= 0.6 && (!best || overlap > best.overlap)) best = { l, overlap };
    }
    if (best) choice = best.l;
  }
  const probabilities = {};
  for (const l of labels) probabilities[l] = l === choice ? 0.92 : Math.round((0.08 / Math.max(1, labels.length - 1)) * 1000) / 1000;
  return { expected, reply: { answers: { field: { type: "choice", choice, confidence: 0.84, probabilities } }, provider: "jev", model: "jev-1.13", via: "cloudflare", latencyMs: 15 } };
}

/** Install the stand-in on a Playwright BrowserContext. `log` collects one row per question. */
async function mockJev(context, answerKey = {}, log = []) {
  await context.route(/\/api\/decide\/status(\?.*)?$/, (route) => {
    const probe = /probe=(1|true)/.test(route.request().url());
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probe ? { ...STATUS, probe: PROBE } : STATUS) });
  });
  await context.route(/\/api\/decide$/, (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch { body = {}; }
    const out = oracle(body, answerKey);
    if (!out) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "mock: no field question" }) });
    log.push({ expected: out.expected, choice: out.reply.answers.field.choice, chosen: out.reply.answers.field.choice === "none_of_these" ? null : body.questions.field.criteria[out.reply.answers.field.choice], options: Object.keys(body.questions.field.criteria).length - 1 });
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out.reply) });
  });
}

module.exports = { mockJev, oracle, STATUS, PROBE };
