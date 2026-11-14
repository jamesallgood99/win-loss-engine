// Small dependency-free chart helpers (HTML + SVG), styled from CSS tokens.
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const tip = () => document.getElementById("tooltip");
export function bindTooltips(root) {
  root.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("pointerenter", (e) => show(e, el.dataset.tip));
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", hide);
    el.addEventListener("focus", (e) => {
      const r = el.getBoundingClientRect();
      show({ clientX: r.right, clientY: r.top }, el.dataset.tip);
    });
    el.addEventListener("blur", hide);
  });
}
function show(e, html) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  move(e);
}
function move(e) {
  const t = tip();
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  t.style.left = Math.max(8, x) + "px";
  t.style.top = Math.max(8, y) + "px";
}
function hide() { tip().hidden = true; }

// Horizontal bars. rows: [{label, value, display, tip}]
export function hbar(rows, { max } = {}) {
  const m = max ?? Math.max(...rows.map((r) => r.value), 1e-9);
  return `<div class="hbar">${rows.map((r) => `
    <div class="hbar-row" tabindex="0" data-tip="${esc(r.tip || `<b>${esc(r.label)}</b><br>${esc(r.display)}`)}">
      <span class="lbl">${esc(r.label)}</span>
      <span class="track"><span class="bar" style="width:${Math.max(0, (r.value / m) * 100).toFixed(2)}%"></span></span>
      <span class="val">${esc(r.display)}</span>
    </div>`).join("")}</div>`;
}

// Sequential-ramp heatmap cell background (7 steps, one hue)
export function heatStyle(v, max) {
  if (!(v > 0) || !(max > 0)) return "background:var(--seq-0)";
  const step = Math.min(6, Math.max(1, Math.ceil((v / max) * 6)));
  const darkText = step <= 3;
  return `background:var(--seq-${step});color:${darkText ? "var(--ink)" : "#fff"}`;
}

// Collateral quadrant: x = reach (contacts, sqrt scale), y = lift (log scale)
const STATUS_FILL = { double_down: "var(--good)", amplify: "var(--accent)", fix: "var(--warn)", kill: "var(--crit)", insufficient: "var(--neutral)" };
export function quadrant(items, { width = 860, height = 420, medianReach, liftCut = 1.2 }) {
  const pad = { l: 56, r: 20, t: 18, b: 44 };
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const maxReach = Math.max(...items.map((d) => d.reach)) * 1.08;
  const x = (v) => pad.l + Math.sqrt(v / maxReach) * W;
  const yMin = 0.5, yMax = 3.0;
  const y = (v) => pad.t + (1 - (Math.log(Math.min(Math.max(v, yMin), yMax)) - Math.log(yMin)) / (Math.log(yMax) - Math.log(yMin))) * H;
  const yTicks = [0.5, 0.75, 1, 1.5, 2, 3];
  const xTicks = niceTicks(maxReach);
  const mx = x(medianReach), my = y(liftCut);
  let s = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Collateral quadrant: reach versus lift">`;
  s += `<g class="axis">`;
  for (const t of yTicks) s += `<line x1="${pad.l}" x2="${pad.l + W}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}x</text>`;
  for (const t of xTicks) s += `<text x="${x(t)}" y="${pad.t + H + 18}" text-anchor="middle">${t.toLocaleString("en-US")}</text>`;
  s += `<text x="${pad.l + W / 2}" y="${height - 4}" text-anchor="middle">Reach: contacts who engaged with the asset</text>`;
  s += `<text transform="translate(14 ${pad.t + H / 2}) rotate(-90)" text-anchor="middle">Lift at its strongest stage</text></g>`;
  s += `<line x1="${mx}" x2="${mx}" y1="${pad.t}" y2="${pad.t + H}" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
  s += `<line x1="${pad.l}" x2="${pad.l + W}" y1="${my}" y2="${my}" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
  s += `<line x1="${pad.l}" x2="${pad.l + W}" y1="${y(1)}" y2="${y(1)}" stroke="var(--ink-2)" stroke-width="1"/>`;
  const q = (tx, ty, anchor, label, color) => `<text class="qlabel" x="${tx}" y="${ty}" text-anchor="${anchor}" fill="${color}">${label}</text>`;
  s += q(pad.l + W - 4, pad.t + 12, "end", "Double down", "var(--good-ink)");
  s += q(pad.l + 6, pad.t + 12, "start", "Amplify", "var(--accent-ink)");
  s += q(pad.l + W - 4, pad.t + H - 8, "end", "Fix or replace", "var(--warn-ink)");
  s += q(pad.l + 6, pad.t + H - 8, "start", "Kill", "var(--crit-ink)");
  const sorted = [...items].sort((a, b) => b.reach - a.reach);
  const placed = []; // label boxes, to keep labels from colliding
  let labels = "";
  for (const d of sorted) {
    const cx = x(d.reach), cy = y(d.lift);
    s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="${STATUS_FILL[d.status]}" stroke="var(--surface)" stroke-width="2" tabindex="0" data-tip="${esc(d.tip)}" style="cursor:default"/>`;
    if (!d.label) continue;
    const w = d.label.length * 6.2, prefLeft = cx > pad.l + W * 0.62;
    const hits = (xx, yy) => placed.some((r) => xx < r.x1 && xx + w > r.x0 && yy - 11 < r.y1 && yy + 3 > r.y0);
    // try beside the dot on the preferred side, then the other side, then nudged up or down
    const cands = [];
    for (const dy of [0, 12, -12, 22, -22]) for (const lft of [prefLeft, !prefLeft]) cands.push([lft ? cx - 11 - w : cx + 11, cy + 4 + dy]);
    const [x0, ly] = cands.find(([xx, yy]) => !hits(xx, yy)) || cands[0];
    placed.push({ x0, x1: x0 + w, y0: ly - 11, y1: ly + 3 });
    labels += `<text class="lbl" x="${x0.toFixed(1)}" y="${ly.toFixed(1)}">${esc(d.label)}</text>`;
  }
  s += labels;
  return s + `</svg>`;
}
function niceTicks(max) {
  const raw = [100, 250, 500, 1000, 1500, 2000, 3000, 5000, 10000];
  return [0, ...raw.filter((t) => t <= max)];
}
