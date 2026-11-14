// Product tour for the public demo: an intro and the four views worth seeing.
// It opens on a first visit (or with ?tour in the URL), and the ribbon's "Take the tour" button reopens it.
// As you step through, the dashboard behind it switches to that view. Numbers use all periods and segments.
import { esc } from "./charts.js";

const SEEN = "wle-tour-seen";
const seen = () => { try { return localStorage.getItem(SEEN) === "1"; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN, "1"); } catch { /* private mode: fine */ } };
const pct = (v) => Math.round(v * 100) + "%";
const fmtN = (v) => Math.round(v).toLocaleString("en-US");

function facts(E) {
  const o = { period: E.periods.all.range, tier: "all" };
  const ov = E.overview(o), svr = E.statedVsReal(o), cv = E.customerVoice(o), recs = E.recommendations(o), dr = E.drivers(o);
  const lostN = Object.values(dr.lost).reduce((a, b) => a + b, 0) || 1;
  const lost = Object.entries(dr.lost).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => ({ label: E.THEME[t].label, share: n / lostN }));
  const quote = E.evidence({ source: "winloss", outcome: "lost" }).find((s) => s.primary && s.dealRec.crm_reason === "Price" && s.codes[0]?.theme === "exec_sponsor");
  return { ov, svr, gap: cv.gaps[0], recs: recs.slice(0, 3), lost, quote, T: E.THEME };
}

const v = {
  intro: (f) => `<div class="tf-intro">
    <div class="tf-funnel">${[["CRM reasons", f.ov.sources.crm], ["Sales calls", f.ov.sources.call], ["Win/loss interviews", f.ov.sources.winloss], ["Customer interviews", f.ov.sources.interview], ["CAB recordings", f.ov.sources.cab], ["Reviews", f.ov.sources.review]]
      .map(([k, n]) => `<div class="tf-stage"><span>${k}</span><b>${fmtN(n || 0)}</b><small>excerpts</small></div>`).join("")}</div>
    <div class="tf-scale"><span><b>${fmtN(f.ov.closed)}</b> closed deals</span><span><b>${pct(f.ov.winRate)}</b> win rate</span><span><b>${Object.keys(f.T).length}</b> themes</span><span>every number links to a quote</span></div></div>`,
  stated: (f) => `<div class="tf-two">
    <div class="tf-renew"><span class="tf-label">Share of losses blamed on price</span>
      <div class="tf-bar"><span>CRM picklist</span><i style="width:${pct(f.svr.priceStated)};background:var(--crit)"></i><b>${pct(f.svr.priceStated)}</b></div>
      <div class="tf-bar"><span>What buyers said</span><i style="width:${pct(f.svr.priceReal)}"></i><b>${pct(f.svr.priceReal)}</b></div>
      <div class="tf-note">${pct(f.svr.accuracy)} of CRM loss reasons match the buyer's.</div></div>
    ${f.quote ? `<div class="quote lost compact"><blockquote>“${esc(f.quote.text)}”</blockquote><div class="qmeta"><span class="tag src">Win/loss interview</span><span>CRM said: Price</span></div></div>` : ""}</div>`,
  drivers: (f) => `<div class="tf-post">${f.lost.map((x) => `<div class="tf-post-row"><span>${esc(x.label)}</span><b>${pct(x.share)}</b><small>of losses</small></div>`).join("")}<div class="tf-note">Click any bar in the dashboard to read the quotes behind it.</div></div>`,
  voice: (f) => f.gap ? `<div class="tf-post">
    <div class="tf-post-row"><span>Lost deals</span><b>${pct(f.gap.lossShare)}</b><small>reason for the loss</small></div>
    <div class="tf-post-row"><span>Customer interviews</span><b>${pct(f.gap.interviewShare)}</b><small>raised it</small></div>
    <div class="tf-post-row"><span>CAB priority votes</span><b>${pct(f.gap.cabVoteShare)}</b><small>of all votes</small></div>
    <div class="tf-post-row"><span>Reviews</span><b>${pct(f.gap.reviewShare)}</b><small>listed it as a con</small></div>
    <div class="tf-note">${esc(f.T[f.gap.theme].label)}: ${f.gap.corroboration} of 4 sources agree.</div></div>` : "",
  actions: (f) => `<div class="tf-two tf-opt">
    <div class="tf-recs">${f.recs.map((r) => `<div class="tf-rec ${r.severity}"><div><b>${esc(r.title)}</b><small>${esc(r.metric || "")}</small></div></div>`).join("")}</div>
    <div class="tf-deck" aria-hidden="true"><div class="tf-slide"><i></i><i></i><i></i></div><div class="tf-slide"><i></i><i></i></div><div class="tf-slide"><i></i><i></i><i></i></div><span>Leadership deck<br><b>.pptx, editable</b></span></div></div>`,
};

export function startTour(E) {
  let f = null;
  const steps = [
    { intro: true, kicker: "Product tour", tab: "overview", title: "Why deals are won and lost, in buyers' own words",
      body: () => "Most win/loss programs trust the CRM dropdown or run a few interviews a year. This one codes every source where buyers and customers explain themselves, then ties each finding to the quotes behind it. Acme Corp, its customers and its competitors are fictional.", visual: v.intro },
    { kicker: "Feature 1 of 4", tab: "stated", title: "Find out what the CRM gets wrong",
      body: (x) => `Reps logged price on ${pct(x.svr.priceStated)} of losses. Buyers named price on ${pct(x.svr.priceReal)}. The Stated vs. real view shows what each picklist reason was hiding.`, visual: v.stated, cta: "See stated vs. real" },
    { kicker: "Feature 2 of 4", tab: "themes", title: "See what actually moves win rate",
      body: () => "Every theme is scored on how much it changes win rate, compared within the same segment and corrected for running many tests. Trends show what's getting better and what's getting worse, quarter by quarter.", visual: v.drivers, cta: "Open Why we win & lose" },
    { kicker: "Feature 3 of 4", tab: "customers", title: "Hear the same gap from every direction",
      body: () => "Customer interviews, advisory board votes and reviews are scored alongside lost deals. A gap one source mentions is an anecdote. A gap four sources agree on goes on the roadmap.", visual: v.voice, cta: "Open Customer voice" },
    { kicker: "Feature 4 of 4", tab: "actions", title: "Turn it into a plan",
      body: () => "The Actions tab ranks what to change in sales process, product, pricing, messaging and retention, each with the quotes behind it. One click builds an editable PowerPoint readout for leadership.", visual: v.actions, cta: "Go to Actions" },
  ];
  const root = document.createElement("div");
  root.className = "tour";
  root.hidden = true;
  root.innerHTML = `<div class="tour-backdrop" data-close></div>
  <div class="tour-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
    <div class="tour-bar"><span class="tour-kicker" id="tour-kicker"></span><button class="tour-x" type="button" data-close aria-label="Close the tour">×</button></div>
    <div class="tour-visual" id="tour-visual"></div>
    <div class="tour-copy"><h2 id="tour-title"></h2><p id="tour-body"></p><button class="tour-cta" type="button" id="tour-cta" data-close hidden></button></div>
    <div class="tour-foot"><ol class="tour-steps" id="tour-steps" aria-label="Tour steps"></ol>
      <div class="tour-buttons"><button class="btn" type="button" id="tour-back"></button><button class="btn primary" type="button" id="tour-next"></button></div></div>
    <p class="visually-hidden" aria-live="polite" id="tour-status"></p>
  </div>`;
  document.body.appendChild(root);
  const q = (id) => root.querySelector("#" + id);
  const dialog = root.querySelector(".tour-dialog");
  q("tour-steps").innerHTML = steps.map((s, i) => `<li><button type="button" data-step="${i}" aria-label="${i ? esc(s.title) : "Intro"}"></button></li>`).join("");
  let cur = 0, opener = null;
  function draw() {
    f ??= facts(E);
    const s = steps[cur], last = cur === steps.length - 1;
    dialog.classList.toggle("is-intro", !!s.intro);
    q("tour-kicker").textContent = s.kicker;
    q("tour-title").textContent = s.title;
    q("tour-body").innerHTML = s.body(f);
    q("tour-visual").innerHTML = s.visual(f);
    q("tour-cta").hidden = !s.cta;
    if (s.cta) q("tour-cta").textContent = s.cta + " →";
    q("tour-back").textContent = s.intro ? "Skip, I'll explore" : "Back";
    q("tour-next").textContent = s.intro ? "Show me around" : last ? "Start exploring" : "Next";
    q("tour-steps").querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-current", i === cur ? "step" : "false"));
    q("tour-status").textContent = s.intro ? "" : `${s.kicker}: ${s.title}`;
    if (location.hash.slice(1) !== s.tab) history.replaceState(null, "", "#" + s.tab), dispatchEvent(new HashChangeEvent("hashchange"));
    dialog.scrollTop = 0;
  }
  function open() { opener = document.activeElement; cur = 0; draw(); root.hidden = false; document.documentElement.classList.add("tour-on"); q("tour-next").focus({ preventScroll: true }); }
  function close() { markSeen(); root.hidden = true; document.documentElement.classList.remove("tour-on"); if (opener && document.contains(opener)) opener.focus(); }
  const go = (i) => { cur = Math.max(0, Math.min(steps.length - 1, i)); draw(); };
  q("tour-next").onclick = () => (cur === steps.length - 1 ? close() : go(cur + 1));
  q("tour-back").onclick = () => (steps[cur].intro ? close() : go(cur - 1));
  q("tour-steps").onclick = (e) => { const b = e.target.closest("[data-step]"); if (b) go(+b.dataset.step); };
  root.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); if (cur < steps.length - 1) go(cur + 1); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); return; }
    if (e.key !== "Tab") return;
    const els = [...dialog.querySelectorAll("button")].filter((b) => !b.hidden && b.offsetParent !== null);
    if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === els.at(-1)) { e.preventDefault(); els[0].focus(); }
  });
  document.querySelectorAll("[data-tour-open]").forEach((b) => b.addEventListener("click", open));
  if (new URLSearchParams(location.search).has("tour") || !seen()) open();
}
