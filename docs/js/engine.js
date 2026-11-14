/*
 * Win/Loss Engine: analysis over a coded voice-of-customer corpus (schema "wle/1").
 *
 * The corpus holds closed deals (with the CRM's stated reason), coded excerpts from six
 * sources, customer interviews, CAB sessions and reviews. Codes are theme + polarity +
 * confidence, assigned by Claude in production (see prompts/code-excerpt.md) and simulated
 * for the demo. Everything here is deterministic and runs in the browser or in Node.
 * Time unit: hours since meta.epoch.
 */
export const DAY = 24;
const BUYER_SOURCES = new Set(["call", "winloss"]);
const CUSTOMER_SOURCES = new Set(["interview", "cab", "review"]);
const FDR = 0.1;

// CRM picklist reasons and the real drivers that are consistent with each
const CONSISTENT = {
  "Price": ["pricing"],
  "Missing feature": ["erp_integration", "ai_agents"],
  "Lost to competitor": ["ai_agents", "pricing", "erp_integration", "time_to_value"],
  "No decision / timing": ["timing_budget", "exec_sponsor", "security_review"],
  "Other": [],
};

export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function bh(rows) {
  const ok = rows.filter((r) => r.p != null).sort((a, b) => a.p - b.p);
  let cut = -1;
  ok.forEach((r, i) => { if (r.p <= ((i + 1) / ok.length) * FDR) cut = i; });
  ok.forEach((r, i) => (r.sig = i <= cut));
  return rows;
}
const STOP = new Set(("a an the and or but if then so to of in on at by for with without from into over under about as is are was were be been being it its it's this that these those there here we us our ours you your yours they them their he she his her i me my mine not no nor do does did done have has had having just very really also too than more most less much many any some each every all both either neither one two three four five six seven eight nine ten first second same other another such what which who whom whose when where why how can could would should will shall may might must out up down off again further once only own s t don't didn't wasn't weren't isn't aren't couldn't wouldn't won't can't we'd we're we've i'd i'm i've you'd you're they'd they're that's what's let's it'll get got go going went make made lot lots thing things way well even still back came else nobody anyone everyone everything something nothing anything every time within during basically before after until when while who whom good actually real able because used runs keeping built").split(" "));

export function createEngine(raw) {
  const meta = raw.meta;
  const END = meta.days * DAY;
  const themes = raw.themes;
  const THEME = Object.fromEntries(themes.map((t) => [t.id, t]));
  const comps = raw.competitors;
  const COMP = Object.fromEntries(comps.map((c) => [c.id, c]));
  const deals = raw.deals;
  const dealById = Object.fromEntries(deals.map((d) => [d.id, d]));
  const snips = raw.snippets;
  const byDeal = new Map();
  for (const s of snips) if (s.deal) (byDeal.get(s.deal) || byDeal.set(s.deal, []).get(s.deal)).push(s);

  const periods = {
    all: { id: "all", label: "All 24 months", range: [0, END] },
    fy25: { id: "fy25", label: "FY25 (Nov 2024 – Oct 2025)", range: [0, 365 * DAY] },
    fy26: { id: "fy26", label: "FY26 (Nov 2025 – Oct 2026)", range: [365 * DAY, END] },
  };
  const inP = (t, p) => t >= p[0] && t < p[1];
  const cache = new Map();
  const memo = (k, f) => (cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k)));
  const key = (o) => JSON.stringify(o);
  const presale = themes.filter((t) => t.phase !== "postsale");

  // -------------------------------------------------------------------------
  // Per-deal coding summary
  // -------------------------------------------------------------------------
  const dealInfo = new Map();
  for (const d of deals) {
    const ss = byDeal.get(d.id) || [];
    const pres = {};
    const score = {};
    let primary = null;
    for (const s of ss) {
      if (!BUYER_SOURCES.has(s.source)) continue;
      for (const c of s.codes) {
        const k = c.theme + (c.polarity > 0 ? "+" : "-");
        pres[k] = true;
        const want = d.outcome === "won" ? 1 : -1;
        if (c.polarity === want) score[c.theme] = (score[c.theme] || 0) + c.confidence * (s.source === "winloss" ? 2 : 1);
        if (s.primary && c.polarity === want) primary = c.theme;
      }
    }
    const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
    const driver = primary || (ranked[0] ? ranked[0][0] : null);
    const responses = ss.filter((s) => s.response).map((s) => s.response);
    dealInfo.set(d.id, { pres, driver, driverSource: primary ? "winloss" : ranked.length ? "calls" : "none", responses, hasInterview: ss.some((s) => s.source === "winloss") });
  }

  function dealsIn(o = {}) {
    const p = o.period || periods.all.range;
    return deals.filter((d) => inP(d.closed, p) && (!o.tier || o.tier === "all" || d.tier === o.tier));
  }

  // -------------------------------------------------------------------------
  function overview(o) {
    return memo("ov" + key(o), () => {
      const ds = dealsIn(o);
      const won = ds.filter((d) => d.outcome === "won");
      const lost = ds.filter((d) => d.outcome === "lost");
      const p = o.period || periods.all.range;
      const sources = {};
      for (const s of snips) {
        const t = s.t;
        if (!inP(t, p)) continue;
        if (o.tier && o.tier !== "all" && s.deal && dealById[s.deal].tier !== o.tier) continue;
        sources[s.source] = (sources[s.source] || 0) + 1;
      }
      return {
        closed: ds.length, won: won.length, lost: lost.length, winRate: ds.length ? won.length / ds.length : 0,
        wonValue: won.reduce((a, d) => a + d.amount, 0), lostValue: lost.reduce((a, d) => a + d.amount, 0),
        interviewed: ds.filter((d) => dealInfo.get(d.id).hasInterview).length,
        sources, excerpts: Object.values(sources).reduce((a, b) => a + b, 0),
      };
    });
  }

  function drivers(o) {
    return memo("dr" + key(o), () => {
      const out = { lost: {}, won: {}, lostValue: {}, unclear: 0 };
      for (const d of dealsIn(o)) {
        const info = dealInfo.get(d.id);
        if (!info.driver) { out.unclear++; continue; }
        const side = d.outcome === "won" ? "won" : "lost";
        out[side][info.driver] = (out[side][info.driver] || 0) + 1;
        if (side === "lost") out.lostValue[info.driver] = (out.lostValue[info.driver] || 0) + d.amount;
      }
      return out;
    });
  }

  // Win-rate impact of each theme (mentioned as a negative / positive), stratified by segment.
  function themeImpact(o) {
    return memo("ti" + key(o), () => {
      const ds = dealsIn(o);
      const tiers = [...new Set(ds.map((d) => d.tier))];
      const rows = [];
      for (const t of presale) {
        for (const pol of ["-", "+"]) {
          const k = t.id + pol;
          let n = 0, w = 0, diffNum = 0, diffDen = 0, varSum = 0;
          let nWith = 0, wWith = 0, nWo = 0, wWo = 0;
          for (const tier of tiers) {
            const g = ds.filter((d) => d.tier === tier);
            const a = g.filter((d) => dealInfo.get(d.id).pres[k]);
            const b = g.filter((d) => !dealInfo.get(d.id).pres[k]);
            nWith += a.length; wWith += a.filter((d) => d.outcome === "won").length;
            nWo += b.length; wWo += b.filter((d) => d.outcome === "won").length;
            if (a.length < 2 || b.length < 2) continue;
            const pa = a.filter((d) => d.outcome === "won").length / a.length;
            const pb = b.filter((d) => d.outcome === "won").length / b.length;
            const wt = (a.length * b.length) / (a.length + b.length);
            diffNum += wt * (pa - pb);
            diffDen += wt;
            const pp = (a.filter((d) => d.outcome === "won").length + b.filter((d) => d.outcome === "won").length) / (a.length + b.length);
            varSum += wt * wt * pp * (1 - pp) * (1 / a.length + 1 / b.length);
            n += a.length; w += 1;
          }
          if (nWith < 8) continue;
          const diff = diffDen ? diffNum / diffDen : 0;
          const se = diffDen ? Math.sqrt(varSum) / diffDen : 0;
          const z = se ? diff / se : 0;
          rows.push({ theme: t.id, polarity: pol === "+" ? 1 : -1, mentions: nWith, winWith: nWith ? wWith / nWith : 0, winWithout: nWo ? wWo / nWo : 0, impact: diff, z, p: se ? 2 * (1 - normCdf(Math.abs(z))) : null });
        }
      }
      return bh(rows).sort((a, b) => a.impact - b.impact);
    });
  }

  // -------------------------------------------------------------------------
  function statedVsReal(o) {
    return memo("svr" + key(o), () => {
      const lost = dealsIn(o).filter((d) => d.outcome === "lost");
      const reasons = Object.keys(CONSISTENT);
      const matrix = {};
      let consistent = 0, judged = 0;
      for (const d of lost) {
        const real = dealInfo.get(d.id).driver || "unclear";
        matrix[d.crm_reason] ??= {};
        matrix[d.crm_reason][real] = (matrix[d.crm_reason][real] || 0) + 1;
        if (real !== "unclear") {
          judged++;
          if ((CONSISTENT[d.crm_reason] || []).includes(real)) consistent++;
        }
      }
      const stated = Object.fromEntries(reasons.map((r) => [r, lost.filter((d) => d.crm_reason === r).length]));
      const realCounts = {};
      lost.forEach((d) => { const r = dealInfo.get(d.id).driver || "unclear"; realCounts[r] = (realCounts[r] || 0) + 1; });
      const priceStated = stated["Price"] / Math.max(1, lost.length);
      const priceReal = (realCounts.pricing || 0) / Math.max(1, lost.length);
      const priceMisfiled = matrix["Price"] ? Object.entries(matrix["Price"]).filter(([k]) => k !== "pricing").sort((a, b) => b[1] - a[1]) : [];
      return { lost: lost.length, reasons, matrix, stated, realCounts, accuracy: judged ? consistent / judged : null, priceStated, priceReal, priceMisfiled };
    });
  }

  // -------------------------------------------------------------------------
  function competitors(o) {
    return memo("cp" + key(o), () => {
      const ds = dealsIn(o);
      return comps.map((c) => {
        const g = ds.filter((d) => d.competitor === c.id);
        const won = g.filter((d) => d.outcome === "won");
        const lost = g.filter((d) => d.outcome === "lost");
        const tally = (arr) => {
          const m = {};
          arr.forEach((d) => { const r = dealInfo.get(d.id).driver; if (r) m[r] = (m[r] || 0) + 1; });
          return Object.entries(m).sort((a, b) => b[1] - a[1]);
        };
        const fy = (p) => {
          const x = g.filter((d) => inP(d.closed, p));
          return { n: x.length, winRate: x.length ? x.filter((d) => d.outcome === "won").length / x.length : null };
        };
        // the clearest buyer quote from a loss to this competitor
        let quote = null;
        for (const d of lost) for (const s of byDeal.get(d.id) || []) {
          if (s.speaker_side !== "buyer" || !s.codes.length) continue;
          if (s.codes[0].theme !== dealInfo.get(d.id).driver) continue;
          const sc = s.codes[0].confidence + (s.source === "winloss" ? 0.5 : 0);
          if (!quote || sc > quote.sc) quote = { sc, s, d };
        }
        return { ...c, deals: g.length, won: won.length, lost: lost.length, winRate: g.length ? won.length / g.length : null,
          lostValue: lost.reduce((a, d) => a + d.amount, 0), lossDrivers: tally(lost), winDrivers: tally(won),
          fy25: fy(periods.fy25.range), fy26: fy(periods.fy26.range), quote: quote && { ...quote.s, deal: quote.d } };
      }).filter((c) => c.deals > 0).sort((a, b) => b.deals - a.deals);
    });
  }

  // Quarterly share of losses by real driver (fiscal quarters, Nov start)
  function trends(o) {
    return memo("tr" + key({ tier: o.tier }), () => {
      const q = Array.from({ length: 8 }, (_, i) => ({ label: `Q${(i % 4) + 1} FY${25 + Math.floor(i / 4)}`, range: [i * 91.25 * DAY, (i + 1) * 91.25 * DAY], lost: 0, by: {} }));
      for (const d of dealsIn({ tier: o.tier })) {
        if (d.outcome !== "lost") continue;
        const qi = Math.min(7, Math.floor(d.closed / DAY / 91.25));
        q[qi].lost++;
        const r = dealInfo.get(d.id).driver;
        if (r) q[qi].by[r] = (q[qi].by[r] || 0) + 1;
      }
      return { quarters: q, soc2Quarter: Math.floor(meta.soc2_day / 91.25) };
    });
  }

  // -------------------------------------------------------------------------
  // Buyer language: phrases buyers and customers use vs Acme's messaging
  // -------------------------------------------------------------------------
  function language(o) {
    return memo("lang" + key(o), () => {
      const p = o.period || periods.all.range;
      const docs = new Map(); // phrase -> Set(account)
      const themeOf = new Map();
      const texts = [];
      for (const s of snips) {
        if (s.speaker_side === "acme" || s.source === "crm" || !inP(s.t, p)) continue;
        if (o.tier && o.tier !== "all" && s.deal && dealById[s.deal].tier !== o.tier) continue;
        const text = s.text.toLowerCase().replace(/[’']/g, "'");
        texts.push(text);
        const toks = text.replace(/[^a-z0-9' -]/g, " ").split(/\s+/).filter(Boolean);
        const seen = new Set();
        for (let n = 2; n <= 3; n++) {
          for (let i = 0; i + n <= toks.length; i++) {
            const g = toks.slice(i, i + n);
            if (g.some((x) => STOP.has(x) || x.length < 2 || /^\d+$/.test(x))) continue;
            const ph = g.join(" ");
            if (seen.has(ph)) continue;
            seen.add(ph);
            (docs.get(ph) || docs.set(ph, new Set()).get(ph)).add(s.account);
            const th = s.codes[0]?.theme;
            if (th) { const m = themeOf.get(ph) || themeOf.set(ph, {}).get(ph); m[th] = (m[th] || 0) + 1; }
          }
        }
      }
      const msg = raw.messaging.map((m) => m.toLowerCase());
      let top = [...docs.entries()].map(([ph, set]) => ({ phrase: ph, accounts: set.size })).filter((x) => x.accounts >= 6).sort((a, b) => b.accounts - a.accounts);
      // drop phrases contained in a more frequent longer phrase with similar count
      top = top.filter((x) => !top.some((y) => y !== x && y.phrase.includes(x.phrase) && y.accounts >= x.accounts * 0.8));
      // keep phrases anchored to a few themes; filler ("to be fair") spreads evenly across all of them
      top = top.filter((x) => {
        const th = Object.values(themeOf.get(x.phrase) || {}).sort((a, b) => b - a);
        const tot = th.reduce((a, v) => a + v, 0);
        return tot && th.slice(0, 3).reduce((a, v) => a + v, 0) / tot >= 0.75;
      });
      // collapse fragments of the same sentence: phrases that occur in nearly the same accounts
      const kept = [];
      for (const x of top.sort((a, b) => b.accounts - a.accounts || b.phrase.split(" ").length - a.phrase.split(" ").length)) {
        const sx = docs.get(x.phrase);
        const dup = kept.some((k) => {
          const sk = docs.get(k.phrase);
          let inter = 0;
          sx.forEach((v) => { if (sk.has(v)) inter++; });
          return inter / (sx.size + sk.size - inter) >= 0.6;
        });
        if (!dup) kept.push(x);
      }
      top = kept.slice(0, 20).map((x) => {
        const th = themeOf.get(x.phrase) || {};
        const tt = Object.entries(th).sort((a, b) => b[1] - a[1])[0];
        const ex = snips.find((sn) => sn.speaker_side !== "acme" && sn.text.toLowerCase().replace(/[’']/g, "'").includes(x.phrase));
        return { ...x, theme: tt ? tt[0] : null, example: ex ? ex.text : "", inMessaging: msg.some((m) => m.includes(x.phrase) || x.phrase.includes(m)) };
      });
      const echo = msg.map((m) => ({ phrase: m, mentions: texts.filter((t) => t.includes(m)).length }));
      return { top, echo, excerpts: texts.length };
    });
  }

  // -------------------------------------------------------------------------
  function objections(o) {
    return memo("obj" + key(o), () => {
      const ds = dealsIn(o);
      return Object.entries(raw.responses).map(([theme, approaches]) => {
        const rows = approaches.map((a) => {
          const g = ds.filter((d) => dealInfo.get(d.id).responses.some((r) => r.objection === theme && r.approach === a.id));
          const w = g.filter((d) => d.outcome === "won").length;
          const ex = snips.find((s) => s.response && s.response.objection === theme && s.response.approach === a.id);
          return { ...a, deals: g.length, won: w, winRate: g.length ? w / g.length : null, example: ex ? ex.text : "" };
        });
        let z = null, p = null;
        if (rows.length === 2 && rows.every((r) => r.deals >= 5)) {
          const [x, y] = rows;
          const pp = (x.won + y.won) / (x.deals + y.deals);
          const se = Math.sqrt(pp * (1 - pp) * (1 / x.deals + 1 / y.deals));
          z = se ? (x.winRate - y.winRate) / se : 0;
          p = 2 * (1 - normCdf(Math.abs(z)));
        }
        const best = [...rows].filter((r) => r.deals >= 5).sort((a, b) => b.winRate - a.winRate)[0] || null;
        return { theme, rows, best, z, p, sig: p != null && p < 0.05, total: rows.reduce((a, r) => a + r.deals, 0) };
      }).sort((a, b) => b.total - a.total);
    });
  }

  // -------------------------------------------------------------------------
  // Customer voice: interviews, CAB, reviews, plus how loss reasons line up
  // -------------------------------------------------------------------------
  function customerVoice(o) {
    return memo("cv" + key(o), () => {
      const p = o.period || periods.all.range;
      const tierOk = (acct) => !o.tier || o.tier === "all" || (raw.accountTier?.[acct] ?? tierOfAccount(acct)) === o.tier;
      const cs = snips.filter((s) => CUSTOMER_SOURCES.has(s.source) && inP(s.t, p) && tierOk(s.account));
      const units = { interview: new Set(), cab: new Set(), review: new Set() };
      cs.forEach((s) => units[s.source].add(s.interview || s.cab + ":" + s.account || s.review));
      const counts = {};
      for (const s of cs) {
        for (const c of s.codes) {
          const k = c.theme + (c.polarity > 0 ? "+" : "-");
          counts[k] ??= { theme: c.theme, polarity: c.polarity, interview: new Set(), cab: new Set(), review: new Set(), quotes: [] };
          counts[k][s.source].add(s.interview || (s.cab ? s.cab + ":" + s.account : s.review));
          if (counts[k].quotes.length < 3 && c.confidence > 0.8) counts[k].quotes.push(s);
        }
      }
      const ivN = Math.max(1, units.interview.size), rvN = Math.max(1, units.review.size);
      const cabSessions = raw.cab_sessions.filter((c) => inP(c.t, p));
      const votes = {};
      let voteTotal = 0;
      cabSessions.forEach((c) => Object.entries(c.votes).forEach(([k, v]) => { votes[k] = (votes[k] || 0) + v; voteTotal += v; }));
      const dr = drivers(o);
      const lostN = Object.values(dr.lost).reduce((a, b) => a + b, 0) || 1;
      const themesOut = Object.values(counts).map((x) => ({
        theme: x.theme, polarity: x.polarity,
        interviewShare: x.interview.size / ivN, reviewShare: x.review.size / rvN, cabMentions: x.cab.size,
        cabVoteShare: x.polarity < 0 && voteTotal ? (votes[x.theme] || 0) / voteTotal : 0,
        lossShare: x.polarity < 0 ? (dr.lost[x.theme] || 0) / lostN : 0,
        quotes: x.quotes,
      }));
      // signal strength for gaps: average of the four normalized shares; corroboration = sources over 10%
      const gaps = themesOut.filter((x) => x.polarity < 0 && x.theme !== "time_to_value").map((x) => {
        const parts = [x.lossShare, x.interviewShare, x.cabVoteShare, x.reviewShare];
        return { ...x, signal: parts.reduce((a, b) => a + b, 0) / 4, corroboration: parts.filter((v) => v >= 0.1).length };
      }).sort((a, b) => b.signal - a.signal);
      const strengths = themesOut.filter((x) => x.polarity > 0).sort((a, b) => b.interviewShare + b.reviewShare - (a.interviewShare + a.reviewShare));
      // churn signals: interviewed customers whose renewal came due
      const ivs = raw.interviews.filter((i) => inP(i.t, p) && tierOk(i.account) && i.renewal !== "not yet up");
      const churn = {};
      for (const iv of ivs) {
        const th = new Set(snips.filter((s) => s.interview === iv.id).flatMap((s) => s.codes.map((c) => c.theme + (c.polarity > 0 ? "+" : "-"))));
        th.forEach((t) => { churn[t] ??= { churned: 0, renewed: 0 }; churn[t][iv.renewal === "churned" ? "churned" : "renewed"]++; });
      }
      const nCh = ivs.filter((i) => i.renewal === "churned").length, nRe = ivs.length - nCh;
      const churnSignals = Object.entries(churn).map(([k, v]) => ({ key: k, theme: k.slice(0, -1), polarity: k.endsWith("+") ? 1 : -1, churnedRate: nCh ? v.churned / nCh : 0, renewedRate: nRe ? v.renewed / nRe : 0 }))
        .map((x) => ({ ...x, ratio: x.renewedRate ? x.churnedRate / x.renewedRate : null })).filter((x) => x.churnedRate >= 0.15).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
      const reviews = raw.reviews.filter((r) => inP(r.t, p) && tierOk(r.account));
      const stars = [1, 2, 3, 4, 5].map((s) => reviews.filter((r) => r.stars === s).length);
      const avgStars = reviews.length ? reviews.reduce((a, r) => a + r.stars, 0) / reviews.length : null;
      const cabByTheme = {};
      raw.cab_sessions.forEach((c, i) => Object.entries(c.votes).forEach(([k, v]) => { cabByTheme[k] ??= Array(raw.cab_sessions.length).fill(0); cabByTheme[k][i] = v; }));
      return { units: { interviews: units.interview.size, cab: cabSessions.length, reviews: reviews.length }, gaps, strengths, churnSignals, churnN: { churned: nCh, renewed: nRe }, stars, avgStars, cabSessions: raw.cab_sessions, cabByTheme };
    });
  }
  const acctTier = new Map();
  deals.forEach((d) => acctTier.set(d.account, d.tier));
  raw.interviews.forEach((i) => acctTier.set(i.account, i.tier));
  raw.reviews.forEach((r) => acctTier.set(r.account, r.tier));
  function tierOfAccount(a) { return acctTier.get(a) || null; }

  // -------------------------------------------------------------------------
  function evidence(f = {}) {
    const p = f.period || periods.all.range;
    const q = (f.q || "").toLowerCase().trim();
    return snips.filter((s) => {
      if (!inP(s.t, p)) return false;
      if (f.source && f.source !== "all" && s.source !== f.source) return false;
      if (f.theme && f.theme !== "all" && !s.codes.some((c) => c.theme === f.theme && (!f.polarity || c.polarity === f.polarity))) return false;
      const d = s.deal ? dealById[s.deal] : null;
      if (f.outcome && f.outcome !== "all" && (!d || d.outcome !== f.outcome)) return false;
      if (f.competitor && f.competitor !== "all" && (!d || d.competitor !== f.competitor)) return false;
      if (f.tier && f.tier !== "all" && (d ? d.tier : tierOfAccount(s.account)) !== f.tier) return false;
      if (f.deal && s.deal !== f.deal) return false;
      if (q && !s.text.toLowerCase().includes(q) && !(s.speaker || "").toLowerCase().includes(q) && !(d && d.account_name.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => b.t - a.t).map((s) => ({ ...s, dealRec: s.deal ? dealById[s.deal] : null }));
  }

  // -------------------------------------------------------------------------
  function recommendations(o) {
    return memo("rec" + key(o), () => {
      const out = [];
      const pct = (v) => Math.round(v * 100) + "%";
      const $ = (v) => (v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1e3) + "K");
      const L = (id) => THEME[id]?.label || id;
      const lc = (x) => (x && /^[A-Z][a-z]/.test(x) ? x[0].toLowerCase() + x.slice(1) : x);
      const svr = statedVsReal(o);
      const dr = drivers(o);
      const obj = objections(o);
      const cv = customerVoice(o);
      const tr = trends(o);
      const cps = competitors(o);
      const lang = language(o);
      const topLoss = Object.entries(dr.lost).sort((a, b) => b[1] - a[1]);
      const lostTotal = Object.values(dr.lost).reduce((a, b) => a + b, 0) || 1;
      const objFor = (t) => obj.find((x) => x.theme === t);

      // 1. stated vs real
      if (svr.priceStated > svr.priceReal * 1.4) {
        const mis = svr.priceMisfiled.slice(0, 2).map(([k, n]) => `${lc(L(k))} (${n})`).join(" and ");
        out.push({ kind: "process", severity: "critical", title: `The CRM blames price for ${pct(svr.priceStated)} of losses; buyers blame it for ${pct(svr.priceReal)}`,
          detail: `Deals logged as "Price" were really lost to ${mis}. Only ${pct(svr.accuracy)} of loss reasons in the CRM match what buyers told us. Make the picklist a draft that the win/loss review confirms, and interview at least a third of lost deals over $50K.`,
          metric: `${pct(svr.accuracy)} CRM accuracy`, theme: "pricing" });
      }
      // 2. top loss driver + best play
      if (topLoss[0]) {
        const [t, n] = topLoss[0];
        const ob = objFor(t);
        const play = ob && ob.best && ob.rows.length === 2 ? ob.rows.find((r) => r !== ob.best) : null;
        out.push({ kind: "driver", severity: "critical", title: `${L(t)} is the #1 reason Acme loses (${pct(n / lostTotal)} of losses)`,
          detail: `${n} lost deals worth ${$(dr.lostValue[t] || 0)} trace back to it.${ob && ob.best && play ? ` When reps ${lc(ob.best.label)}, Acme won ${pct(ob.best.winRate)} of those deals, against ${pct(play.winRate)} when they ${lc(play.label)}${ob.sig ? "" : " (directional; the sample is small)"}. Make it a required step before a deal can move to proposal.` : ""}`,
          metric: `${$(dr.lostValue[t] || 0)} lost`, theme: t });
      }
      // 3. cross-source product gap
      const gap = cv.gaps.find((g) => g.corroboration >= 3);
      if (gap) {
        out.push({ kind: "product", severity: "warning", title: `Every source points to the same gap: ${lc(L(gap.theme))}`,
          detail: `It shows up in ${pct(gap.lossShare)} of losses, ${pct(gap.interviewShare)} of customer interviews, ${pct(gap.cabVoteShare)} of CAB votes and ${pct(gap.reviewShare)} of reviews. That's ${$(dr.lostValue[gap.theme] || 0)} in lost deals plus expansion customers say they're holding back. Take it to the product roadmap with the quotes attached.`,
          metric: `${gap.corroboration} of 4 sources`, theme: gap.theme });
      }
      // 4. rising competitive threat
      const rising = cps.filter((c) => c.fy25.n >= 8 && c.fy26.n >= 8 && c.fy26.n > c.fy25.n * 1.3).sort((a, b) => b.fy26.n / b.fy25.n - a.fy26.n / a.fy25.n)[0];
      if (rising) {
        const all = Object.values(dr.lost).reduce((x, y) => x + y, 0) || 1;
        const lostVs = rising.lossDrivers.reduce((x, y) => x + y[1], 0) || 1;
        const drv = rising.lossDrivers.filter(([, n]) => n >= 4).sort((x, y) => y[1] / lostVs / ((dr.lost[y[0]] || 1) / all) - x[1] / lostVs / ((dr.lost[x[0]] || 1) / all))[0];
        const ob = drv && objFor(drv[0]);
        out.push({ kind: "competitor", severity: "warning", title: `${rising.name} is the fastest-growing threat`,
          detail: `Acme met ${rising.name} in ${rising.fy26.n} closed deals in FY26, up from ${rising.fy25.n}, and won ${pct(rising.fy26.winRate)} of them (${pct(rising.fy25.winRate)} in FY25). Losses to ${rising.name} over-index on ${drv ? lc(L(drv[0])) : "product gaps"} (${drv ? pct(drv[1] / lostVs) : ""} of them).${ob && ob.best ? ` When it came up, reps who ${lc(ob.best.label)} won ${pct(ob.best.winRate)} of deals, against ${pct(ob.rows.find((r) => r !== ob.best).winRate)} for the alternative. Put that on the battlecard.` : ""}`,
          metric: `${rising.fy25.n} → ${rising.fy26.n} deals`, competitor: rising.id });
      }
      // 5. what improved (security after SOC 2)
      const q = tr.quarters, s2 = tr.soc2Quarter;
      const shareOf = (t, qs) => { const lost = qs.reduce((a, x) => a + x.lost, 0); return lost ? qs.reduce((a, x) => a + (x.by[t] || 0), 0) / lost : 0; };
      const before = shareOf("security_review", q.slice(0, s2 + 1)), after = shareOf("security_review", q.slice(s2 + 1));
      if (before > 0.08 && after < before * 0.6) out.push({ kind: "win", severity: "good", title: "The SOC 2 report fixed security-review losses",
        detail: `Security review drove ${pct(before)} of losses before the SOC 2 Type II report and ${pct(after)} after. Keep the security packet going out in week one${(objFor("security_review")?.sig) ? "; the objection data backs it up" : ""}.`, metric: `${pct(before)} → ${pct(after)}`, theme: "security_review" });
      // 6. pricing response
      const pr = objFor("pricing");
      if (pr && pr.best && pr.best.id === "usage_tier") out.push({ kind: "pricing", severity: "opportunity", title: "Usage-based pricing beats discounting",
        detail: `When price came up, offering usage-based starter pricing won ${pct(pr.best.winRate)} of deals; discounting per-seat price won ${pct(pr.rows.find((r) => r !== pr.best).winRate)}. Buyers object to paying for occasional approvers, not to the price itself. Test a usage-based package for SMB.`, metric: `${pct(pr.best.winRate)} vs ${pct(pr.rows.find((r) => r !== pr.best).winRate)}`, theme: "pricing" });
      // 7. messaging
      const unused = lang.top.filter((x) => !x.inMessaging).slice(0, 4).map((x) => `"${x.phrase}"`);
      const dead = lang.echo.filter((x) => x.mentions === 0).map((x) => `"${x.phrase}"`);
      if (unused.length) out.push({ kind: "messaging", severity: "opportunity", title: "Talk the way buyers talk",
        detail: `Buyers keep saying ${unused.join(", ")}. None of it appears in Acme's messaging, while ${dead.slice(0, 3).join(", ")} never came up once in ${lang.excerpts.toLocaleString("en-US")} buyer and customer excerpts. Rewrite the homepage and first-call talk track in buyer language and test it in the GTM Simulator.`,
        metric: `${dead.length} phrases never echoed` });
      // 8. churn signal
      const ch = cv.churnSignals.find((x) => x.polarity < 0 && x.ratio && x.ratio >= 1.4);
      if (ch) out.push({ kind: "retention", severity: "warning", title: `Churned customers raised ${lc(L(ch.theme))} first`,
        detail: `${pct(ch.churnedRate)} of interviewed customers who later churned raised it, against ${pct(ch.renewedRate)} of those who renewed. Add it to the customer health score and give CSMs a play for it before renewal.`, metric: `${ch.ratio.toFixed(1)}x more common`, theme: ch.theme });
      const rank = { critical: 0, warning: 1, opportunity: 2, good: 3 };
      return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
    });
  }

  return { meta, themes, THEME, competitors: comps, COMP, deals, snippets: snips, periods, END, dealInfo,
    overview, drivers, themeImpact, statedVsReal, competitorsView: competitors, trends, language, objections, customerVoice, evidence, recommendations, tierOfAccount,
    dateOf: (h) => new Date(Date.parse(meta.epoch) + h * 3600e3) };
}
