// A stand-in for Jev served from the browser (Playwright route), so every decision path can be exercised without
// credentials. Same reply shape as /api/decide. Four question types:
//   field / control / mapping  choice: the test's answer key names the control it renamed on purpose (expected → wanted);
//                              otherwise an option whose description shares at least 60% of the expected words, else none.
//   c1…cN                      noul "would activating this commit data?": destructive verbs → 0.95, everything else 0.05.
//   q1…qN                      noul "needs a person's judgment?": decision-maker / budget / approval wording → 0.92, else 0.08.
const STATUS = { configured: true, provider: "jev", model: "typesafe/jev", via: "cloudflare" };
const PROBE = { ok: true, latencyMs: 180, route: "catalog", model: "jev-1.13", detail: 'chose "Budget confirmation" (combobox; options: Requested, Approved, Allocated) with p 0.93, confidence 0.81 (the expected answer)' };
const tokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
const DESTRUCTIVE_RE = /^(delete|remove|archive|purge|wipe|reset|erase|destroy)\b/i;
const JUDGMENT_RE = /decision[- ]maker|economic buyer|budget|funding|approv|sponsor|who decides/i;

function chooseAmong(q, expected, answerKey) {
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
  return { type: "choice", choice, confidence: 0.84, probabilities };
}

/** The name a labelled line of the state carries: `c3: "Refund payment" (menu item)` → Refund payment. */
function labelledName(state, label) {
  const m = new RegExp(`^${label}: "([^"]+)"`, "m").exec(state || "");
  return m ? m[1] : "";
}

function oracle(body, answerKey) {
  const questions = body.questions || {};
  const answers = {};
  const rows = [];
  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "choice") {
      const expected = name === "mapping" ? (/requires: "([^"]+)"/.exec(body.state || "") || [])[1] || "" : (/knew as "([^"]+)"/.exec(body.state || "") || [])[1] || "";
      const a = chooseAmong(q, expected, answerKey);
      answers[name] = a;
      rows.push({ question: name, expected, choice: a.choice, chosen: a.choice === "none_of_these" ? null : q.criteria[a.choice], options: Object.keys(q.criteria).length - 1 });
    } else if (q.type === "noul") {
      const subject = labelledName(body.state, name);
      const commitQuestion = /^c\d+$/.test(name);
      // answerKey.__commit lists names a test wants marked as commits regardless of their wording.
      const forced = Array.isArray(answerKey.__commit) && answerKey.__commit.includes(subject);
      const p = commitQuestion ? (forced || DESTRUCTIVE_RE.test(subject) ? 0.97 : 0.05) : JUDGMENT_RE.test(subject) ? 0.92 : 0.08;
      answers[name] = { type: "noul", noul: p };
      rows.push({ question: name, expected: subject, noul: p });
    }
  }
  if (!Object.keys(answers).length) return null;
  return { rows, reply: { answers, provider: "jev", model: "jev-1.13", via: "cloudflare", latencyMs: 15 } };
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
    if (!out) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "mock: no question understood" }) });
    log.push(...out.rows);
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out.reply) });
  });
}

module.exports = { mockJev, oracle, STATUS, PROBE };
