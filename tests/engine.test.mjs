// Run: node tests/engine.test.mjs
// Checks the engine against the patterns the generator planted (tests/truth.json).
import { readFileSync } from "node:fs";
import { createEngine } from "../docs/js/engine.js";

const raw = JSON.parse(readFileSync(new URL("../docs/data/corpus.json", import.meta.url)));
const truth = JSON.parse(readFileSync(new URL("./truth.json", import.meta.url)));
const E = createEngine(raw);
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) fails++; };
const o = {};

// 1. Real driver per deal matches the planted primary driver
//    (higher bar when a win/loss interview exists; calls alone are noisier, as in real life)
const acc = { winloss: [0, 0], calls: [0, 0] };
for (const d of raw.deals) {
  const info = E.dealInfo.get(d.id);
  if (!info.driver) continue;
  const k = info.driverSource;
  acc[k][1]++;
  if (info.driver === truth.deals[d.id].primary) acc[k][0]++;
}
const r = (k) => acc[k][0] / acc[k][1];
check(r("winloss") >= 0.85, `driver matches planted truth when a win/loss interview exists: ${acc.winloss[0]}/${acc.winloss[1]} (${Math.round(r("winloss") * 100)}%)`);
check(r("calls") >= 0.45, `driver matches planted truth from call excerpts alone: ${acc.calls[0]}/${acc.calls[1]} (${Math.round(r("calls") * 100)}%)`);

// 2. Stated vs real: the CRM overstates price
const s = E.statedVsReal(o);
check(s.priceStated > 1.8 * s.priceReal, `CRM says price ${Math.round(s.priceStated * 100)}%, buyers ${Math.round(s.priceReal * 100)}%`);

// 3. Theme effects have the planted direction
const ti = E.themeImpact(o);
const row = (t, p) => ti.find((r) => r.theme === t && r.polarity === p);
check(row("exec_sponsor", -1)?.sig && row("exec_sponsor", -1).impact < 0, "no executive sponsor lowers win rate (significant)");
check(row("erp_integration", -1)?.sig && row("erp_integration", -1).impact < 0, "ERP gap lowers win rate (significant)");
check(row("time_to_value", 1)?.sig && row("time_to_value", 1).impact > 0, "fast time to first workflow raises win rate (significant)");

// 4. Objection responses: the effective approach wins more often
for (const ob of E.objections(o)) {
  const want = truth.objection_effects[ob.theme];
  const better = ob.rows.find((r) => r.id === want), worse = ob.rows.find((r) => r.id !== want);
  check(better.winRate >= worse.winRate, `${ob.theme}: "${better.id}" ${Math.round(better.winRate * 100)}% vs "${worse.id}" ${Math.round(worse.winRate * 100)}%${ob.sig ? " (significant)" : ""}`);
}

// 5. Cross-source gap is the planted one
const cv = E.customerVoice(o);
check(cv.gaps[0].theme === truth.planted.cross_source_gap && cv.gaps[0].corroboration >= 3, `strongest cross-source gap: ${cv.gaps[0].theme} in ${cv.gaps[0].corroboration} of 4 sources`);

// 6. Trends: security falls after SOC 2, AI agents rise in FY26
const tr = E.trends(o);
const share = (t, qs) => qs.reduce((a, q) => a + (q.by[t] || 0), 0) / Math.max(1, qs.reduce((a, q) => a + q.lost, 0));
const s2 = tr.soc2Quarter;
check(share("security_review", tr.quarters.slice(0, s2 + 1)) > share("security_review", tr.quarters.slice(s2 + 1)), "security-review losses fall after the SOC 2 report");
check(share("ai_agents", tr.quarters.slice(4)) > share("ai_agents", tr.quarters.slice(0, 4)), "AI-agent losses rise in FY26");

// 7. Messaging: buyer phrases surface, most messaging phrases never echo
const lang = E.language(o);
check(lang.top.some((x) => x.phrase.includes("month-end close")) && lang.echo.filter((x) => x.mentions === 0).length >= 5, "buyer language surfaces and messaging gaps are found");

console.log("\nRecommendations:");
E.recommendations(o).forEach((r) => console.log(`  [${r.severity}] ${r.title}`));
process.exit(fails ? 1 : 0);
