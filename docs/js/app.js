import { createEngine } from "./engine.js";
import { hbar, heatStyle, bindTooltips, esc } from "./charts.js";
import { buildDeck } from "./deck.js";
import { startTour } from "./tour.js";

const $ = (s, r = document) => r.querySelector(s);
const view = $("#view");
const fmtN = (v, d = 0) => (v == null || !isFinite(v) ? "–" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
const fmt$ = (v) => (v == null || !isFinite(v) ? "–" : Math.abs(v) >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e4 ? "$" + Math.round(v / 1e3) + "K" : "$" + Math.round(v).toLocaleString("en-US"));
const pct = (v, d = 0) => (v == null || !isFinite(v) ? "–" : (v * 100).toFixed(d) + "%");
const pp = (v) => (v > 0 ? "+" : "") + Math.round(v * 100) + " pts";
const ACR = (s) => s.replace(/\berp\b/g, "ERP").replace(/\broi\b/g, "ROI").replace(/\bai\b/g, "AI").replace(/\bit\b(?= \b)/g, "it");
const TABS = ["overview", "themes", "stated", "competitors", "objections", "language", "customers", "evidence", "actions", "method"];

let E;
const state = { period: "all", tier: "all", tab: "overview", ev: { source: "all", theme: "all", polarity: 0, outcome: "all", competitor: "all", q: "" }, evLimit: 40 };
try { Object.assign(state, JSON.parse(localStorage.getItem("wle-state") || "{}"), { tab: "overview", evLimit: 40 }); } catch { /* storage unavailable */ }
const save = () => { try { localStorage.setItem("wle-state", JSON.stringify({ period: state.period, tier: state.tier })); } catch { /* ignore */ } };
const O = () => ({ period: E.periods[state.period].range, tier: state.tier });
const TL = (id) => E.THEME[id]?.label || id;
const CL = (id) => E.COMP[id]?.name || id;
const SRC = { crm: "CRM", call: "Sales call", winloss: "Win/loss interview", interview: "Customer interview", cab: "CAB recording", review: "Review" };

async function init() {
  const raw = await (await fetch("data/corpus.json")).json();
  E = createEngine(raw);
  $("#ctl-period").innerHTML = Object.values(E.periods).map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
  $("#ctl-period").value = state.period;
  $("#ctl-tier").value = state.tier;
  $("#controls").addEventListener("change", () => { state.period = $("#ctl-period").value; state.tier = $("#ctl-tier").value; state.evLimit = 40; save(); render(); });
  $("#controls").addEventListener("submit", (e) => e.preventDefault());
  addEventListener("hashchange", route);
  route();
  startTour(E);
}
function route() {
  const h = location.hash.slice(1);
  state.tab = TABS.includes(h) ? h : "overview";
  document.querySelectorAll("#tabs a").forEach((a) => (a.dataset.tab === state.tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  render();
}
function render() {
  view.innerHTML = { overview, themes, stated, competitors, objections, language, customers, evidence, actions, method }[state.tab]();
  bindTooltips(view);
  wire();
}
function goEvidence(f) {
  state.ev = { source: "all", theme: "all", polarity: 0, outcome: "all", competitor: "all", q: "", ...f };
  state.evLimit = 40;
  location.hash = "#evidence";
}

// ---------------------------------------------------------------------------
function quote(s, { compact = false } = {}) {
  const d = s.dealRec || (s.deal ? E.deals.find((x) => x.id === s.deal) : null);
  const cls = d ? d.outcome : "cust";
  const when = E.dateOf(s.t).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const codes = s.codes.map((c) => `<span class="tag ${c.polarity > 0 ? "pos" : "neg"}" title="Confidence ${Math.round(c.confidence * 100)}%">${esc(TL(c.theme))}</span>`).join("");
  const ctx = d ? `<span class="tag ${d.outcome}">${d.outcome === "won" ? "Won" : "Lost"} ${fmt$(d.amount)}</span><span>${esc(d.account_name)} · ${esc(d.tier)}${d.competitor ? " · vs " + esc(CL(d.competitor)) : ""}</span>` : `<span>${esc(s.speaker || "")}</span>`;
  return `<article class="quote ${cls} ${compact ? "compact" : ""}">
    <blockquote>“${esc(s.text)}”</blockquote>
    <div class="qmeta"><span class="tag src">${SRC[s.source]}${s.meeting ? " · " + esc(s.meeting) : ""}</span>${d ? `<b>${esc(s.speaker || "")}</b>` : ""}${ctx}<span>${when}</span>${codes}</div>
  </article>`;
}
function topQuotes(f, n = 3) {
  return E.evidence({ ...f, period: E.periods[state.period].range, tier: state.tier })
    .filter((s) => s.speaker_side !== "acme" && s.source !== "crm")
    .sort((a, b) => (b.source === "winloss") - (a.source === "winloss") || (b.codes[0]?.confidence || 0) - (a.codes[0]?.confidence || 0))
    .slice(0, n);
}

// ---------------------------------------------------------------------------
function kpis() {
  const o = E.overview(O());
  const c = (k, v, d, cls = "") => `<div class="kpi ${cls}"><span class="k">${k}</span><span class="v">${v}</span><span class="d">${d}</span></div>`;
  return `<section class="kpis">
    ${c("Closed deals", fmtN(o.closed), `${fmtN(o.won)} won · ${fmtN(o.lost)} lost`)}
    ${c("Win rate", pct(o.winRate), `${fmt$(o.wonValue)} won`)}
    ${c("Revenue lost", fmt$(o.lostValue), "the money this tool explains")}
    ${c("Deals with a win/loss interview", fmtN(o.interviewed), `${pct(o.interviewed / Math.max(1, o.closed))} of closed deals`)}
    ${c("Coded excerpts", fmtN(o.excerpts), `${Object.keys(o.sources).length} sources`)}
  </section>`;
}
function driverRows(side) {
  const dr = E.drivers(O());
  const m = dr[side];
  const tot = Object.values(m).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({
    label: TL(t), value: n / tot, display: pct(n / tot),
    tip: `<b>${esc(TL(t))}</b><br>${n} ${side} deals${side === "lost" ? `<br>${fmt$(dr.lostValue[t] || 0)} lost` : ""}<br>Click for the quotes`,
    theme: t,
  }));
}
function hbarLinked(rows, side) {
  const html = hbar(rows);
  // attach theme ids in order so rows open the evidence
  let i = 0;
  return html.replace(/class="hbar-row"/g, () => `class="hbar-row" role="button" data-ev-theme="${rows[i].theme}" data-ev-outcome="${side}" style="cursor:pointer"` + (i++, ""));
}
function overview() {
  const s = E.statedVsReal(O());
  const recs = E.recommendations(O()).slice(0, 3);
  return `${kpis()}
  <section class="panel">
    <div class="panel-head"><h2>The CRM says price. Buyers say otherwise.</h2><p>Share of lost deals blamed on price, by who's talking.</p></div>
    <div class="big-compare">
      <div class="stat"><span class="v lost">${pct(s.priceStated)}</span><span class="k">of losses logged as "Price" in the CRM</span></div>
      <div class="stat"><span class="v">${pct(s.priceReal)}</span><span class="k">where buyers name price as the real reason</span></div>
      <div class="stat"><span class="v">${pct(s.accuracy)}</span><span class="k">of CRM loss reasons match what buyers told us</span></div>
    </div>
    <p class="small muted" style="margin-top:10px"><a href="#stated">See what "Price" was hiding →</a></p>
  </section>
  <div class="grid-2">
    <section class="panel"><div class="panel-head"><h2>Why Acme loses</h2><p>Real reason per lost deal, from interviews and calls. Click a bar for the quotes.</p></div>${hbarLinked(driverRows("lost"), "lost")}</section>
    <section class="panel"><div class="panel-head"><h2>Why Acme wins</h2><p>Real reason per won deal.</p></div>${hbarLinked(driverRows("won"), "won")}</section>
  </div>
  <section class="panel">
    <div class="panel-head"><h2>Top actions</h2><a href="#actions">All recommendations and the leadership deck →</a></div>
    <div class="recs">${recs.map(recCard).join("")}</div>
  </section>`;
}

// ---------------------------------------------------------------------------
function themes() {
  const rows = E.themeImpact(O());
  const max = Math.max(0.6, ...rows.map((r) => Math.abs(r.impact)));
  const tr = E.trends(O());
  const watch = ["exec_sponsor", "pricing", "erp_integration", "ai_agents", "security_review", "timing_budget"];
  return `
  <section class="panel">
    <div class="panel-head"><h2>What moves win rate</h2><p>Win rate when buyers raise a theme, compared with comparable deals where they don't, within the same segment. Faded bars aren't statistically significant after correcting for many tests. Click a row for the quotes.</p></div>
    <div class="dv-axis"><span></span><span><span>Lowers win rate</span><span>Raises win rate</span></span><span>Impact</span><span>Deals</span></div>
    <div class="diverge">${rows.map((r) => {
      const w = (Math.abs(r.impact) / max) * 50;
      const name = (r.polarity < 0 ? "Problem: " : "Strength: ") + TL(r.theme);
      return `<div class="dv-row" tabindex="0" role="button" data-ev-theme="${r.theme}" data-ev-pol="${r.polarity}" data-tip="${esc(`<b>${name}</b><br>Win rate ${pct(r.winWith)} when raised vs ${pct(r.winWithout)} otherwise<br>${r.mentions} deals · ${r.sig ? "significant" : "not significant"}`)}">
        <span>${esc(name)}</span><span class="dv-track"><span class="dv-bar ${r.impact < 0 ? "neg" : "pos"} ${r.sig ? "" : "ns"}" style="width:${w.toFixed(1)}%"></span></span><span class="v">${pp(r.impact)}</span><span class="v">${r.mentions}</span></div>`;
    }).join("")}</div>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>How loss reasons change over time</h2><p>Share of each quarter's lost deals by real reason. The SOC 2 Type II report arrived in ${tr.quarters[tr.soc2Quarter].label}.</p></div>
    <div class="tbl-wrap"><table class="heat"><thead><tr><th>Reason</th>${tr.quarters.map((q, i) => `<th class="c">${q.label}${i === tr.soc2Quarter ? " ◆" : ""}</th>`).join("")}</tr></thead>
    <tbody>${watch.map((t) => `<tr><td>${esc(TL(t))}</td>${tr.quarters.map((q) => {
      const v = q.lost >= 10 ? (q.by[t] || 0) / q.lost : null;
      return v == null ? `<td class="cell muted" data-tip="Too few lost deals this quarter (${q.lost}) to show a share">–</td>` : `<td class="cell" style="${heatStyle(v, 0.45)}" data-tip="${esc(`<b>${TL(t)}</b><br>${q.label}: ${q.by[t] || 0} of ${q.lost} lost deals`)}">${pct(v)}</td>`;
    }).join("")}</tr>`).join("")}
    <tr><td class="muted">Lost deals</td>${tr.quarters.map((q) => `<td class="trend-cell muted">${q.lost}</td>`).join("")}</tr></tbody></table></div>
    <p class="small muted" style="margin-top:8px">◆ SOC 2 Type II report available. Quarters with fewer than 10 lost deals are left blank.</p>
  </section>`;
}

// ---------------------------------------------------------------------------
function stated() {
  const s = E.statedVsReal(O());
  const reals = Object.entries(s.realCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const max = Math.max(...s.reasons.flatMap((r) => reals.map((k) => s.matrix[r]?.[k] || 0)));
  const mis = s.priceMisfiled.slice(0, 3);
  return `
  <section class="panel">
    <div class="panel-head"><h2>Stated vs. real loss reasons</h2><p>Each lost deal sits where the CRM picklist (rows) meets the reason buyers gave in win/loss interviews or on calls (columns). A clean CRM would put most deals on a handful of matching cells. Click a cell for the quotes.</p></div>
    <div class="tbl-wrap"><table class="heat matrix"><thead><tr><th>CRM says ↓ · Buyers say →</th>${reals.map((k) => `<th class="c rot">${esc(k === "unclear" ? "Unclear" : TL(k))}</th>`).join("")}<th class="c">Total</th></tr></thead>
    <tbody>${s.reasons.filter((r) => s.stated[r]).map((r) => `<tr><td><b>${esc(r)}</b></td>${reals.map((k) => {
      const v = s.matrix[r]?.[k] || 0;
      return `<td class="cell" style="${heatStyle(v, max)}" ${v ? `role="button" tabindex="0" data-ev-theme="${k === "unclear" ? "all" : k}" data-ev-outcome="lost" data-ev-q="" data-tip="${esc(`<b>CRM: ${r}</b><br>Buyers: ${k === "unclear" ? "unclear" : TL(k)}<br>${v} lost deals`)}" style="cursor:pointer;${heatStyle(v, max)}"` : ""}>${v || ""}</td>`;
    }).join("")}<td class="cell">${s.stated[r]}</td></tr>`).join("")}</tbody></table></div>
  </section>
  <div class="grid-2">
    <section class="panel"><div class="panel-head"><h2>What "Price" was hiding</h2><p>${s.stated["Price"]} lost deals were logged as price. Buyers in those deals pointed to:</p></div>
      ${hbar(Object.entries(s.matrix["Price"] || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k === "unclear" ? "Unclear" : TL(k), value: v, display: fmtN(v) })))}
    </section>
    <section class="panel"><div class="panel-head"><h2>In their words</h2><p>Buyers in deals the CRM logged as price.</p></div>
      <div class="quotes">${E.evidence({ source: "winloss", outcome: "lost", period: E.periods[state.period].range, tier: state.tier })
        .filter((x) => x.dealRec.crm_reason === "Price" && x.codes[0] && x.codes[0].theme !== "pricing" && x.primary).slice(0, 3).map((x) => quote(x, { compact: true })).join("")}</div>
    </section>
  </div>
  <p class="small muted">Driver source: ${(() => { let wl = 0, c = 0; E.deals.forEach((d) => { const i = E.dealInfo.get(d.id); if (i.driverSource === "winloss") wl++; else if (i.driverSource === "calls") c++; }); return `${wl} deals from a win/loss interview, ${c} inferred from sales-call excerpts alone. On the demo's answer key, interviews identify the real reason 97% of the time and call excerpts about half the time, which is why the recommendations push for more interviews.`; })()}</p>`;
}

// ---------------------------------------------------------------------------
function competitors() {
  const cs = E.competitorsView(O());
  return `
  <section class="panel">
    <div class="panel-head"><h2>Who Acme loses to, and why</h2><p>Win rate against each alternative and the reasons buyers gave. "Status quo" means the buyer kept doing it by hand.</p></div>
    <div class="tbl-wrap"><table><thead><tr><th>Competitor</th><th class="n">Deals</th><th class="n">Win rate</th><th class="n">FY25 → FY26 deals</th><th class="n">Win rate FY25 → FY26</th><th>Top loss reasons</th><th>Top win reasons</th><th class="n">Revenue lost</th></tr></thead>
    <tbody>${cs.map((c) => `<tr>
      <td><b>${esc(c.name)}</b><span class="sub">${esc(c.kind)}</span></td>
      <td class="n">${c.deals}</td><td class="n">${pct(c.winRate)}</td>
      <td class="n">${c.fy25.n} → ${c.fy26.n}</td><td class="n">${pct(c.fy25.winRate)} → ${pct(c.fy26.winRate)}</td>
      <td>${c.lossDrivers.slice(0, 2).map(([t, n]) => `<button class="linkish" data-ev-theme="${t}" data-ev-outcome="lost" data-ev-comp="${c.id}">${esc(TL(t))}</button> <span class="muted">${n}</span>`).join("<br>")}</td>
      <td>${c.winDrivers.slice(0, 2).map(([t, n]) => `${esc(TL(t))} <span class="muted">${n}</span>`).join("<br>")}</td>
      <td class="n">${fmt$(c.lostValue)}</td></tr>`).join("")}</tbody></table></div>
  </section>
  <section class="panel"><div class="panel-head"><h2>The clearest loss quote against each</h2></div>
    <div class="quotes">${cs.filter((c) => c.quote).map((c) => quote({ ...c.quote, dealRec: c.quote.deal })).join("")}</div>
  </section>`;
}

// ---------------------------------------------------------------------------
function objections() {
  const obs = E.objections(O());
  return `
  <section class="panel">
    <div class="panel-head"><h2>Which objection responses work</h2><p>When a buyer raised one of these, reps answered in one of two ways. Win rate is for deals where the rep took that approach. Objections show up mostly in hard deals, so read the comparison between approaches, not the absolute rate.</p></div>
    <div class="grid-2">${obs.map((ob) => {
      const max = Math.max(...ob.rows.map((r) => r.winRate || 0), 0.05);
      return `<div class="verdict"><h3>${esc(TL(ob.theme))} <span class="tag">${ob.total} deals</span></h3>
        <div class="obj">${ob.rows.map((r) => `<div class="obj-row ${ob.best && ob.best.id === r.id ? "best" : ""}">
          <span>${esc(r.label)}<span class="say">“${esc(r.example)}”</span></span>
          <span class="meter"><i style="width:${((r.winRate || 0) / max) * 100}%"></i></span>
          <span class="v num">${pct(r.winRate)}<span class="sub">${r.deals} deals</span></span></div>`).join("")}</div>
        <p class="small ${ob.sig ? "" : "muted"}">${ob.sig ? "The difference is statistically significant." : "Directional: the sample is too small to be sure."}</p></div>`;
    }).join("")}</div>
  </section>`;
}

// ---------------------------------------------------------------------------
function language() {
  const l = E.language(O());
  return `
  <div class="grid-2">
    <section class="panel">
      <div class="panel-head"><h2>What buyers and customers say</h2><p>Most common phrases across ${fmtN(l.excerpts)} buyer and customer excerpts, counted once per account. Flagged phrases never appear in Acme's messaging.</p></div>
      <div class="phrase-list">${l.top.map((x) => `<div class="phrase"><span><q>${esc(ACR(x.phrase))}</q><span class="ex">${esc(x.example.slice(0, 110))}${x.example.length > 110 ? "…" : ""}</span></span><span class="num muted">${x.accounts} accts</span><span class="flag ${x.inMessaging ? "yes" : "no"}">${x.inMessaging ? "In messaging" : "Not in messaging"}</span></div>`).join("")}</div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>What Acme says</h2><p>Phrases from Acme's homepage and pitch deck, and how often a buyer or customer said them back.</p></div>
      ${hbar(l.echo.map((e) => ({ label: e.phrase, value: e.mentions, display: e.mentions ? fmtN(e.mentions) : "never" })), { max: Math.max(1, ...l.echo.map((e) => e.mentions)) })}
      <div class="callout info" style="margin-top:16px"><b>Next step</b><p class="small">Rewrite the homepage hero and the first-call talk track with the flagged phrases, then test both versions in the <a href="https://jamesallgood99.github.io/gtm-simulator/">GTM Simulator</a> before shipping.</p></div>
    </section>
  </div>`;
}

// ---------------------------------------------------------------------------
function customers() {
  const cv = E.customerVoice(O());
  const gaps = cv.gaps.filter((g) => g.signal > 0.03 && g.corroboration >= 1);
  const sessions = cv.cabSessions;
  const cabThemes = Object.keys(cv.cabByTheme);
  const maxV = Math.max(...cabThemes.flatMap((t) => cv.cabByTheme[t]));
  return `
  <section class="kpis">
    <div class="kpi"><span class="k">Customer interviews</span><span class="v">${cv.units.interviews}</span><span class="d">post-sale conversations</span></div>
    <div class="kpi"><span class="k">CAB sessions</span><span class="v">${cv.units.cab}</span><span class="d">8 customers each, with priority votes</span></div>
    <div class="kpi"><span class="k">Reviews</span><span class="v">${cv.units.reviews}</span><span class="d">${cv.avgStars ? cv.avgStars.toFixed(1) + " average stars" : ""}</span></div>
    <div class="kpi"><span class="k">Renewal outcomes tracked</span><span class="v">${cv.churnN.churned + cv.churnN.renewed}</span><span class="d">${cv.churnN.churned} churned · ${cv.churnN.renewed} renewed</span></div>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Gaps, ranked by how many sources agree</h2><p>Share of lost deals where it was the reason, of customer interviews that raised it, of CAB priority votes, and of reviews that list it as a con. One source is an anecdote; four is a roadmap item.</p></div>
    <div class="tbl-wrap"><table class="heat"><thead><tr><th>Gap</th><th class="c">Lost deals</th><th class="c">Interviews</th><th class="c">CAB votes</th><th class="c">Reviews</th><th class="c">Sources agreeing</th><th></th></tr></thead>
    <tbody>${gaps.map((g) => `<tr><td><b>${esc(TL(g.theme))}</b></td>${["lossShare", "interviewShare", "cabVoteShare", "reviewShare"].map((k) => `<td class="cell" style="${heatStyle(g[k], 0.45)}">${g[k] ? pct(g[k]) : "–"}</td>`).join("")}<td class="c num" style="text-align:center"><b>${g.corroboration}</b> of 4</td><td><button class="linkish" data-ev-theme="${g.theme}" data-ev-pol="-1">Quotes</button></td></tr>`).join("")}</tbody></table></div>
  </section>
  <div class="grid-2">
    <section class="panel">
      <div class="panel-head"><h2>Early churn signals</h2><p>Themes raised in customer interviews, by whether the customer later renewed. ${cv.churnN.churned} churned and ${cv.churnN.renewed} renewed customers were interviewed beforehand.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Raised in interview</th><th class="n">Churned</th><th class="n">Renewed</th><th class="n">Ratio</th></tr></thead>
      <tbody>${cv.churnSignals.slice(0, 7).map((x) => `<tr><td>${x.polarity < 0 ? "Problem: " : "Strength: "}${esc(TL(x.theme))}</td><td class="n">${pct(x.churnedRate)}</td><td class="n">${pct(x.renewedRate)}</td><td class="n"><b class="${x.ratio > 1.3 ? "lost" : x.ratio < 0.8 ? "won" : ""}">${x.ratio ? x.ratio.toFixed(1) + "x" : "–"}</b></td></tr>`).join("")}</tbody></table></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>CAB priority votes by session</h2><p>Each member gets three votes per session.</p></div>
      <div class="tbl-wrap"><table class="heat"><thead><tr><th>Ask</th>${sessions.map((s) => `<th class="c">${esc(s.label.replace("Customer Advisory Board, ", ""))}</th>`).join("")}</tr></thead>
      <tbody>${cabThemes.sort((a, b) => cv.cabByTheme[b].reduce((x, y) => x + y, 0) - cv.cabByTheme[a].reduce((x, y) => x + y, 0)).map((t) => `<tr><td>${esc(TL(t))}</td>${cv.cabByTheme[t].map((v) => `<td class="cell" style="${heatStyle(v, maxV)}">${v || ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    </section>
  </div>
  <section class="panel"><div class="panel-head"><h2>What customers value</h2></div>
    ${hbar(cv.strengths.slice(0, 5).map((x) => ({ label: TL(x.theme), value: x.interviewShare + x.reviewShare, display: `${pct(x.interviewShare)} / ${pct(x.reviewShare)}`, tip: `<b>${esc(TL(x.theme))}</b><br>${pct(x.interviewShare)} of interviews · ${pct(x.reviewShare)} of reviews` })))}
    <p class="small muted">Interviews / reviews mentioning it.</p>
  </section>`;
}

// ---------------------------------------------------------------------------
function evidence() {
  const f = state.ev;
  const all = E.evidence({ ...f, polarity: f.polarity || 0, period: E.periods[state.period].range, tier: state.tier }).filter((s) => s.source !== "crm" || f.source === "crm");
  const shown = all.slice(0, state.evLimit);
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${esc(l)}</option>`;
  return `
  <section class="panel">
    <div class="panel-head"><h2>Evidence</h2><p>Every coded excerpt behind the numbers. Filters stack with the period and segment above.</p></div>
    <form class="filters" id="ev-form">
      <label class="ctl"><span>Search</span><input type="search" id="ev-q" value="${esc(f.q)}" placeholder="Words, speaker or account"></label>
      <label class="ctl"><span>Source</span><select id="ev-source">${opt("all", "All sources", f.source)}${Object.entries(SRC).map(([k, v]) => opt(k, v, f.source)).join("")}</select></label>
      <label class="ctl"><span>Theme</span><select id="ev-theme">${opt("all", "All themes", f.theme)}${E.themes.map((t) => opt(t.id, t.label, f.theme)).join("")}</select></label>
      <label class="ctl"><span>Tone</span><select id="ev-pol">${opt(0, "Any", f.polarity)}${opt(-1, "Problem", f.polarity)}${opt(1, "Strength", f.polarity)}</select></label>
      <label class="ctl"><span>Outcome</span><select id="ev-outcome">${opt("all", "Any", f.outcome)}${opt("won", "Won", f.outcome)}${opt("lost", "Lost", f.outcome)}</select></label>
      <label class="ctl"><span>Competitor</span><select id="ev-comp">${opt("all", "Any", f.competitor)}${E.competitors.map((c) => opt(c.id, c.name, f.competitor)).join("")}</select></label>
      <button class="btn" type="button" id="ev-reset">Clear filters</button>
    </form>
    <p class="small muted" style="margin:12px 0">${fmtN(all.length)} excerpts${all.length > shown.length ? `, showing ${shown.length}` : ""}.</p>
    <div class="quotes">${shown.map((s) => quote(s)).join("") || '<p class="muted">No excerpts match these filters.</p>'}</div>
    ${all.length > shown.length ? `<button class="btn more" type="button" id="ev-more">Show 40 more</button>` : ""}
  </section>`;
}

// ---------------------------------------------------------------------------
function recCard(r) {
  const sev = { critical: "Fix now", warning: "Act on", opportunity: "Opportunity", good: "Keep doing" }[r.severity];
  return `<article class="rec ${r.severity}"><span class="stripe"></span><div class="body"><h3>${esc(r.title)}</h3><p>${esc(r.detail)}</p>${r.theme ? `<button class="linkish small" data-ev-theme="${r.theme}" data-ev-pol="${r.kind === "win" ? 1 : -1}">See the quotes →</button>` : ""}</div><div class="meta"><span class="sev">${sev}</span><span class="metric">${esc(r.metric || "")}</span></div></article>`;
}
function actions() {
  const recs = E.recommendations(O());
  return `
  <section class="panel opt-bar">
    <div><h2>Actions</h2><p class="lede">${recs.length} recommendations for ${E.periods[state.period].label}${state.tier !== "all" ? `, ${state.tier}` : ""}, most urgent first. Each one links to the buyer quotes behind it.</p></div>
    <div class="btn-row">
      <button class="btn primary" id="btn-deck" type="button">Build leadership deck (.pptx)</button>
      <button class="btn" id="btn-csv" type="button">Export coded evidence (.csv)</button>
    </div>
  </section>
  <div class="recs">${recs.map(recCard).join("")}</div>`;
}

function method() {
  return `<section class="panel method">
    <h2>How this works</h2>
    <p>The Win/Loss Engine reads every place buyers and customers explain themselves: the CRM's closed-won/lost reason, sales-call transcripts, post-decision win/loss interviews, customer interviews, customer advisory board recordings and reviews. Each excerpt is coded against a theme taxonomy you control, with a polarity (problem or strength) and a confidence score. Every number in the dashboard traces back to coded excerpts you can read in the Evidence tab.</p>
    <h3>Coding</h3>
    <p>In production, Claude codes each excerpt using <code>prompts/code-excerpt.md</code> and <code>scripts/code_with_claude.py</code>. Low-confidence codes go to a person for review, and the taxonomy changes only when a person approves it. For this demo, the corpus is synthetic and ships already coded, with realistic reviewer noise: about 1 in 20 codes lands on a neighboring theme at low confidence.</p>
    <h3>Real reason per deal</h3>
    <p>If a win/loss interview exists, the buyer's answer to "what was the main reason" is the real reason. Otherwise the engine infers it from call excerpts, weighting each coded theme by confidence. On the demo's answer key, interviews get the reason right 97% of the time and call excerpts alone about half the time. Both are shown, so you can see how much of the picture rests on interviews.</p>
    <h3>Statistics</h3>
    <ul>
      <li><b>Theme impact</b> compares win rate in deals where buyers raised a theme with deals where they didn't, within each segment, then pools the segments. Significance uses a two-sided z-test with Benjamini-Hochberg correction at a 10% false discovery rate.</li>
      <li><b>Objection responses</b> compare the win rates of the two approaches with a two-proportion z-test.</li>
      <li><b>Cross-source gaps</b> average four shares: lost deals where it was the reason, customer interviews that raised it, CAB priority votes and reviews listing it as a con. A source "agrees" at 10% or more.</li>
      <li><b>Buyer language</b> counts two- and three-word phrases once per account, drops filler that spreads evenly across themes, and collapses fragments of the same sentence.</li>
    </ul>
    <h3>What the demo plants</h3>
    <p>The generator plants known patterns so the engine can be checked: reps over-log "Price"; missing executive sponsors and ERP gaps lower win rate; security-review losses fall after the June 2025 SOC 2 report; losses to an AI-native competitor rise in FY26; some objection responses work better than others; and buyers use phrases Acme's messaging never does. <code>tests/engine.test.mjs</code> checks each one.</p>
    <h3>Connections</h3>
    <ul>
      <li>Deals and outcomes match the <a href="https://jamesallgood99.github.io/full-funnel-attribution/">Full-Funnel Attribution</a> demo: the same Acme Corp, the same closed deals.</li>
      <li>Buyer language and loss reasons feed new personas and messages into the <a href="https://jamesallgood99.github.io/gtm-simulator/">GTM Simulator</a>.</li>
      <li>Competitor findings update battlecards in the <a href="https://jamesallgood99.github.io/competitive-intel-tracker/">Competitive Intel Tracker</a>.</li>
    </ul>
  </section>`;
}

// ---------------------------------------------------------------------------
function wire() {
  view.querySelectorAll("[data-ev-theme]").forEach((el) => {
    const go = () => goEvidence({ theme: el.dataset.evTheme, outcome: el.dataset.evOutcome || "all", polarity: +(el.dataset.evPol || 0), competitor: el.dataset.evComp || "all" });
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  const form = $("#ev-form");
  if (form) {
    const read = () => {
      state.ev = { q: $("#ev-q").value, source: $("#ev-source").value, theme: $("#ev-theme").value, polarity: +$("#ev-pol").value, outcome: $("#ev-outcome").value, competitor: $("#ev-comp").value };
      state.evLimit = 40;
      render();
      if (document.activeElement !== $("#ev-q")) { const q = $("#ev-q"); q && q.focus(); q && q.setSelectionRange(q.value.length, q.value.length); }
    };
    form.addEventListener("change", (e) => { if (e.target.id !== "ev-q") read(); });
    form.addEventListener("submit", (e) => { e.preventDefault(); read(); });
    let t;
    $("#ev-q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(read, 350); });
    $("#ev-reset").addEventListener("click", () => goEvidence({}) || render());
    const more = $("#ev-more");
    if (more) more.addEventListener("click", () => { state.evLimit += 40; render(); });
  }
  const deckBtn = $("#btn-deck");
  if (deckBtn) deckBtn.addEventListener("click", async () => {
    deckBtn.disabled = true;
    deckBtn.textContent = "Building deck…";
    try {
      const blob = await buildDeck(E, { period: state.period, tier: state.tier, O: O(), fmt$, fmtN, pct, TL, CL });
      await saveFile(`Acme-win-loss-readout-${state.period}.pptx`, blob);
    } catch (e) { toast("Couldn't build the deck: " + (e.message || e.code || e)); }
    finally { deckBtn.disabled = false; deckBtn.textContent = "Build leadership deck (.pptx)"; }
  });
  const csvBtn = $("#btn-csv");
  if (csvBtn) csvBtn.addEventListener("click", () => {
    const rows = E.evidence({ period: E.periods[state.period].range, tier: state.tier });
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["id", "source", "date", "speaker", "account", "deal", "outcome", "amount", "competitor", "crm_reason", "themes", "text"];
    const lines = [head.join(",")].concat(rows.map((s) => [s.id, s.source, E.dateOf(s.t).toISOString().slice(0, 10), s.speaker, s.dealRec?.account_name || s.account, s.deal || "", s.dealRec?.outcome || "", s.dealRec?.amount || "", s.dealRec ? CL(s.dealRec.competitor) : "", s.dealRec?.crm_reason || "",
      s.codes.map((c) => `${c.theme}${c.polarity > 0 ? "+" : "-"}${c.confidence}`).join(" "), s.text].map(q).join(",")));
    saveFile("Acme-win-loss-evidence.csv", new Blob([lines.join("\n")], { type: "text/csv" }));
  });
}
async function saveFile(filename, blob) {
  let dl = null;
  if (window.claude?.use) {
    try { dl = await Promise.race([window.claude.use("downloads"), new Promise((r) => setTimeout(() => r(null), 1500))]); } catch { dl = null; }
  }
  if (dl) {
    try { await dl.save({ filename, data: blob }); toast(`Saved ${filename}`); } catch (e) { if (e?.code !== "declined") toast("Download unavailable here: " + (e?.message || e?.code)); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Downloaded ${filename}`);
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3500);
}

init().catch((e) => { view.innerHTML = `<div class="callout"><h2>Couldn't load the demo data</h2><p>${esc(e.message)}. If you opened index.html from disk, serve the folder instead: <code>python3 -m http.server -d docs</code>.</p></div>`; });
