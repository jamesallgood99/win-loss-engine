// Leadership readout deck, built in the browser with PptxGenJS. Native charts and tables stay editable.
const C = { ink: "15171B", ink2: "4C4B48", muted: "7D7C77", line: "E0DFDA", soft: "F4F4F1", accent: "4659D6", accentDark: "3242AB", good: "0CA30C", crit: "D03B3B", warn: "FAB219" };
const FONT = "Arial";
const W = 13.333, H = 7.5;

export async function buildDeck(E, s) {
  const { O, fmt$, fmtN, pct, TL, CL } = s;
  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = "Win/loss readout";
  pptx.company = "Acme Corp";
  const period = E.periods[s.period];
  const scope = `${period.label}${s.tier !== "all" ? " · " + s.tier : ""}`;
  const ov = E.overview(O), svr = E.statedVsReal(O), dr = E.drivers(O), recs = E.recommendations(O);
  const cps = E.competitorsView(O), obs = E.objections(O), cv = E.customerVoice(O), lang = E.language(O), ti = E.themeImpact(O);
  let n = 0;
  const base = (title, kicker) => {
    const sl = pptx.addSlide();
    n++;
    sl.background = { color: "FFFFFF" };
    if (kicker) sl.addText(kicker.toUpperCase(), { x: 0.6, y: 0.35, w: 9, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: C.accent, charSpacing: 1.5 });
    sl.addText(title, { x: 0.6, y: 0.62, w: W - 1.2, h: 0.85, fontFace: FONT, fontSize: 25, bold: true, color: C.ink, valign: "top", fit: "shrink" });
    sl.addShape(pptx.ShapeType.line, { x: 0.6, y: H - 0.5, w: W - 1.2, h: 0, line: { color: C.line, width: 0.75 } });
    sl.addText(`Acme Corp · Win/loss readout · ${scope}`, { x: 0.6, y: H - 0.45, w: 10, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted });
    sl.addText(String(n), { x: W - 1.1, y: H - 0.45, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted, align: "right" });
    return sl;
  };
  const stat = (sl, x, y, w, label, value, sub, color = C.ink) => {
    sl.addShape(pptx.ShapeType.rect, { x, y, w, h: 1.3, fill: { color: C.soft }, line: { color: C.soft } });
    sl.addText(label, { x: x + 0.18, y: y + 0.1, w: w - 0.3, h: 0.3, fontFace: FONT, fontSize: 11, color: C.ink2, fit: "shrink" });
    sl.addText(value, { x: x + 0.18, y: y + 0.4, w: w - 0.3, h: 0.55, fontFace: FONT, fontSize: 28, bold: true, color });
    if (sub) sl.addText(sub, { x: x + 0.18, y: y + 0.92, w: w - 0.3, h: 0.3, fontFace: FONT, fontSize: 9.5, color: C.muted, fit: "shrink" });
  };
  const table = (sl, head, rows, opts) => {
    const h = head.map((t, j) => ({ text: t, options: { bold: true, color: C.ink2, fontSize: 10.5, fontFace: FONT, fill: { color: C.soft }, align: j && opts.right?.includes(j) ? "right" : "left" } }));
    const b = rows.map((r) => r.map((t, j) => ({ text: String(t), options: { fontSize: 10.5, fontFace: FONT, color: C.ink, align: opts.right?.includes(j) ? "right" : "left" } })));
    sl.addTable([h, ...b], { border: { type: "solid", color: C.line, pt: 0.5 }, rowH: 0.36, valign: "middle", ...opts });
  };
  const bars = (sl, name, labels, values, x, y, w, h, color, title) => sl.addChart(pptx.ChartType.bar, [{ name, labels, values }], {
    x, y, w, h, barDir: "bar", chartColors: [color], showValue: true, dataLabelFontSize: 9, dataLabelFontFace: FONT, dataLabelColor: C.ink2, dataLabelFormatCode: "0%",
    catAxisLabelFontSize: 10, catAxisLabelFontFace: FONT, catAxisLabelColor: C.ink2, valAxisHidden: true, valGridLine: { style: "none" }, barGapWidthPct: 45,
    showTitle: !!title, title, titleFontSize: 12, titleFontFace: FONT, titleColor: C.ink, catAxisOrientation: "maxMin" });

  // 1. Title
  {
    const sl = pptx.addSlide(); n++;
    sl.background = { color: C.ink };
    sl.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.6, w: 1.1, h: 0.75, fill: { color: C.accent }, line: { color: C.accent } });
    sl.addText("Why we win and lose", { x: 0.8, y: 2.7, w: 11, h: 1, fontFace: FONT, fontSize: 40, bold: true, color: "FFFFFF" });
    sl.addText("Win/loss and voice-of-customer readout", { x: 0.8, y: 3.65, w: 11, h: 0.5, fontFace: FONT, fontSize: 20, color: "C3C2B7" });
    sl.addText(`Acme Corp · ${scope} · ${fmtN(ov.closed)} closed deals · ${fmtN(ov.excerpts)} coded excerpts from 6 sources`, { x: 0.8, y: 4.4, w: 11.5, h: 0.4, fontFace: FONT, fontSize: 13, color: "8F8E88" });
    sl.addText(`Prepared ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Demo on synthetic data`, { x: 0.8, y: 6.6, w: 11, h: 0.3, fontFace: FONT, fontSize: 10, color: "8F8E88" });
  }
  // 2. Executive summary
  {
    const top = Object.entries(dr.lost).sort((a, b) => b[1] - a[1])[0];
    const lostN = Object.values(dr.lost).reduce((a, b) => a + b, 0) || 1;
    const sl = base(`We win ${pct(ov.winRate)} of deals. ${top ? `${TL(top[0])} costs us more than price does.` : ""}`, "Executive summary");
    const bw = (W - 1.2 - 0.45) / 4;
    stat(sl, 0.6, 1.6, bw, "Win rate", pct(ov.winRate), `${fmtN(ov.won)} won · ${fmtN(ov.lost)} lost`);
    stat(sl, 0.6 + bw + 0.15, 1.6, bw, "Revenue lost", fmt$(ov.lostValue), `${fmt$(ov.wonValue)} won`, C.crit);
    stat(sl, 0.6 + 2 * (bw + 0.15), 1.6, bw, "Top loss reason", top ? pct(top[1] / lostN) : "–", top ? TL(top[0]) : "");
    stat(sl, 0.6 + 3 * (bw + 0.15), 1.6, bw, "CRM reasons that match buyers", pct(svr.accuracy), `"Price" logged on ${pct(svr.priceStated)} of losses`);
    sl.addText(recs.slice(0, 6).map((r) => ({ text: r.title, options: { bullet: { code: "25A0" }, paraSpaceAfter: 6 } })), { x: 0.6, y: 3.15, w: W - 1.2, h: 3.7, fontFace: FONT, fontSize: 15, color: C.ink, valign: "top", fit: "shrink" });
  }
  // 3. Stated vs real
  {
    const sl = base(`The CRM blames price for ${pct(svr.priceStated)} of losses; buyers blame it for ${pct(svr.priceReal)}`, "Stated vs. real");
    stat(sl, 0.6, 1.6, 3.8, 'Losses logged as "Price"', pct(svr.priceStated), "CRM picklist", C.crit);
    stat(sl, 0.6, 3.05, 3.8, "Buyers who named price", pct(svr.priceReal), "win/loss interviews and calls");
    stat(sl, 0.6, 4.5, 3.8, "CRM reasons matching buyers", pct(svr.accuracy), "all loss reasons");
    const hid = Object.entries(svr.matrix["Price"] || {}).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const tot = hid.reduce((a, x) => a + x[1], 0) || 1;
    bars(sl, "Deals", hid.map(([k]) => (k === "unclear" ? "Unclear" : TL(k))), hid.map(([, v]) => v / tot), 4.8, 1.55, 7.9, 5.3, C.accent, 'What buyers said in deals the CRM logged as "Price"');
  }
  // 4. Why we lose / win
  {
    const sl = base("Why we lose, and why we win", "Real reasons");
    const side = (k) => {
      const e = Object.entries(dr[k]).sort((a, b) => b[1] - a[1]).slice(0, 7);
      const t = Object.values(dr[k]).reduce((a, b) => a + b, 0) || 1;
      return [e.map(([x]) => TL(x)), e.map(([, v]) => v / t)];
    };
    const [l1, v1] = side("lost"), [l2, v2] = side("won");
    bars(sl, "Lost", l1, v1, 0.5, 1.55, 6.1, 5.3, C.crit, "Share of lost deals");
    bars(sl, "Won", l2, v2, 6.8, 1.55, 6.1, 5.3, C.good, "Share of won deals");
  }
  // 5. Theme impact
  {
    const sig = ti.filter((r) => r.sig).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 13).sort((a, b) => a.impact - b.impact);
    const sl = base("What moves win rate", "Theme impact");
    table(sl, ["Theme", "Win rate when raised", "Otherwise", "Impact", "Deals"],
      sig.map((r) => [(r.polarity < 0 ? "Problem: " : "Strength: ") + TL(r.theme), pct(r.winWith), pct(r.winWithout), (r.impact > 0 ? "+" : "") + Math.round(r.impact * 100) + " pts", r.mentions]),
      { x: 0.6, y: 1.5, w: W - 1.2, colW: [5.2, 2, 1.8, 1.6, 1.53], right: [1, 2, 3, 4], rowH: 0.3 });
    sl.addText("Within-segment comparison; only statistically significant themes shown (Benjamini-Hochberg, 10% FDR).", { x: 0.6, y: H - 0.9, w: W - 1.2, h: 0.4, fontFace: FONT, fontSize: 10, color: C.muted });
  }
  // 6. Competitors
  {
    const sl = base(`Competitors: ${cps.map((c) => `${c.name} ${pct(c.winRate)}`).slice(0, 3).join(" · ")}`, "Who we lose to");
    table(sl, ["Competitor", "Deals", "Win rate", "FY25 → FY26 deals", "Win rate FY25 → FY26", "Top loss reason", "Revenue lost"],
      cps.map((c) => [c.name, c.deals, pct(c.winRate), `${c.fy25.n} → ${c.fy26.n}`, `${pct(c.fy25.winRate)} → ${pct(c.fy26.winRate)}`, c.lossDrivers[0] ? TL(c.lossDrivers[0][0]) : "–", fmt$(c.lostValue)]),
      { x: 0.6, y: 1.55, w: W - 1.2, colW: [2, 1, 1.2, 1.9, 2.2, 2.4, 1.43], right: [1, 2, 3, 4, 6] });
  }
  // 7. Objections
  {
    const sl = base("Objection responses that win", "Sales plays");
    const rows = obs.flatMap((ob) => ob.rows.map((r) => [TL(ob.theme), r.label, r.deals, pct(r.winRate), ob.best && ob.best.id === r.id ? (ob.sig ? "Best (significant)" : "Best (directional)") : ""]));
    table(sl, ["Objection", "Rep response", "Deals", "Win rate", ""], rows, { x: 0.6, y: 1.55, w: W - 1.2, colW: [2.6, 5.4, 1, 1.2, 1.93], right: [2, 3], rowH: 0.34 });
  }
  // 8. Customer voice
  {
    const g = cv.gaps.filter((x) => x.signal > 0.03).slice(0, 7);
    const sl = base(g[0] ? `Every source points to ${TL(g[0].theme)}` : "Customer voice", "Customer voice");
    table(sl, ["Gap", "Lost deals", "Interviews", "CAB votes", "Reviews", "Sources agreeing"],
      g.map((x) => [TL(x.theme), pct(x.lossShare), pct(x.interviewShare), pct(x.cabVoteShare), pct(x.reviewShare), `${x.corroboration} of 4`]),
      { x: 0.6, y: 1.55, w: W - 1.2, colW: [4.1, 1.6, 1.6, 1.6, 1.6, 1.63], right: [1, 2, 3, 4, 5] });
    const ch = cv.churnSignals.filter((x) => x.polarity < 0).slice(0, 2);
    if (ch.length) sl.addText(`Early churn signals: ${ch.map((x) => `${TL(x.theme)} (${pct(x.churnedRate)} of churned vs ${pct(x.renewedRate)} of renewed customers)`).join("; ")}.`, { x: 0.6, y: H - 1.25, w: W - 1.2, h: 0.6, fontFace: FONT, fontSize: 12, color: C.ink2 });
  }
  // 9. Buyer language
  {
    const sl = base("Buyers don't talk the way our messaging does", "Buyer language");
    sl.addText("What buyers say", { x: 0.6, y: 1.5, w: 6, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    sl.addText(lang.top.filter((x) => !x.inMessaging).slice(0, 10).map((x) => ({ text: `“${x.phrase.replace(/\berp\b/g, "ERP")}”  ${x.accounts} accounts`, options: { bullet: true, paraSpaceAfter: 4 } })), { x: 0.6, y: 1.9, w: 6, h: 4.7, fontFace: FONT, fontSize: 13, color: C.ink, valign: "top", fit: "shrink" });
    sl.addText("What we say", { x: 6.9, y: 1.5, w: 6, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    sl.addText(lang.echo.map((x) => ({ text: `“${x.phrase}”  ${x.mentions ? x.mentions + " buyer mentions" : "never said back"}`, options: { bullet: true, paraSpaceAfter: 4, color: x.mentions ? C.ink : C.crit } })), { x: 6.9, y: 1.9, w: 5.9, h: 4.7, fontFace: FONT, fontSize: 13, valign: "top", fit: "shrink" });
  }
  // 10. Recommendations
  {
    const sl = base("What we'll do next", "Recommendations");
    const colW = (W - 1.2 - 0.3) / 2;
    recs.slice(0, 6).forEach((r, i) => {
      const x = 0.6 + (i % 2) * (colW + 0.3), y = 1.55 + Math.floor(i / 2) * 1.75;
      const color = { critical: C.crit, warning: C.warn, opportunity: C.accent, good: C.good }[r.severity];
      sl.addShape(pptx.ShapeType.rect, { x, y, w: 0.07, h: 1.55, fill: { color }, line: { color } });
      sl.addText(r.title, { x: x + 0.2, y, w: colW - 0.25, h: 0.5, fontFace: FONT, fontSize: 13, bold: true, color: C.ink, valign: "top", fit: "shrink" });
      sl.addText(r.detail.length > 270 ? r.detail.slice(0, 267).replace(/\s+\S*$/, "") + "…" : r.detail, { x: x + 0.2, y: y + 0.5, w: colW - 0.25, h: 1.05, fontFace: FONT, fontSize: 9.5, color: C.ink2, valign: "top", fit: "shrink" });
    });
  }
  // 11. Method
  {
    const sl = base("How to read these numbers", "Method");
    const items = [
      ["Sources", `CRM reasons, ${fmtN(ov.sources.call || 0)} sales-call excerpts, ${fmtN(ov.sources.winloss || 0)} win/loss interview answers, ${fmtN(ov.sources.interview || 0)} customer interview excerpts, ${fmtN(ov.sources.cab || 0)} CAB excerpts and ${fmtN(ov.sources.review || 0)} review excerpts.`],
      ["Coding", "Claude tags each excerpt with a theme, problem or strength, and a confidence score; a person reviews low-confidence tags and owns the taxonomy."],
      ["Real reason", `From the win/loss interview where one exists (${fmtN(ov.interviewed)} deals); otherwise inferred from call excerpts, which is less reliable.`],
      ["Statistics", "Within-segment win-rate comparisons with Benjamini-Hochberg correction; two-proportion tests for objection responses."],
      ["Data", "Synthetic Acme Corp corpus from the Win/Loss Engine demo, with planted patterns checked by automated tests."],
    ];
    sl.addTable(items.map(([a, b]) => [{ text: a, options: { bold: true, color: C.ink, fontSize: 12 } }, { text: b, options: { color: C.ink2, fontSize: 11.5 } }]), { x: 0.6, y: 1.6, w: W - 1.2, colW: [2.2, W - 3.4], fontFace: FONT, border: { type: "solid", color: C.line, pt: 0.5 }, valign: "top", margin: 0.1 });
  }
  void CL;
  return pptx.write({ outputType: "blob" });
}
