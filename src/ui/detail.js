/* Side panel with one trade's full review, or the list of a day's trades. */
import { S, findTrade, activeTrades } from "../state.js";
import { durationMinutes, rMultiple } from "../lib/calc.js";
import { escapeHtml, money, pnlClass, fmtTime, fmtMins, plural } from "../lib/format.js";
import { $ } from "./dom.js";
import { showScreenshot } from "./images.js";

let onEdit = () => {};
let onDelete = () => {};
let lastFocus = null;

const outcomeClass = o => (o === "W" ? "out-w" : o === "L" ? "out-l" : "out-be");

function open() {
  lastFocus = document.activeElement;
  $("review-overlay").classList.add("open");
  $("review-panel").classList.add("open");
  $("review-panel").setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
  $("review-close").focus();
}

export function closeDetail() {
  if (!$("review-panel").classList.contains("open")) return;
  $("review-overlay").classList.remove("open");
  $("review-panel").classList.remove("open");
  $("review-panel").setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
  lastFocus?.focus?.();
}

function legsTable(label, legs, cls) {
  return `<div><div class="legs-head ${cls}">${label}</div>${(legs || []).map((l, i) =>
    `<div class="leg-line"><span class="dim">Leg ${i + 1}</span><span class="num">${escapeHtml(l.price)} × ${plural(l.contracts, "lot")}</span></div>`).join("")}</div>`;
}

export function showTrade(id) {
  const t = findTrade(id);
  if (!t) return;
  S.reviewId = t.id;
  $("review-edit").hidden = false;
  $("review-delete").hidden = false;
  const tz = S.cfg.timezone;
  const dur = durationMinutes(t.entryTime, t.exitTime);
  const r = rMultiple(t);

  $("review-title").innerHTML = `
    <span class="review-sym">${escapeHtml(t.instrument || "—")}</span>
    ${t.account ? `<span class="account-badge ${t.account === "Live" ? "badge-live" : "badge-prop"}">${escapeHtml(t.account)}</span>` : ""}
    <span class="chip chip-strat">${escapeHtml(t.strat || "No strategy")}</span>
    ${t.ct ? `<span class="ct-name">${escapeHtml(t.ct)}</span>` : ""}
    <span class="out-tag big ${outcomeClass(t.outcome)}">${escapeHtml(t.outcome || "—")}</span>
    <span class="dim small">${escapeHtml(t.date)}${t.entryTime ? " · " + escapeHtml(fmtTime(t.entryTime, t.date, tz)) : ""}</span>`;

  let html = "";
  if (t.chart) html += `<button type="button" class="shot-btn" data-full="${escapeHtml(t.chart)}" aria-label="View screenshot full size"><img class="review-screenshot" alt="Trade screenshot"></button>`;

  const sub = [
    "Net P&amp;L",
    t.grossPnl ? "Gross " + money(t.grossPnl) : "",
    t.commission ? "Commission $" + escapeHtml(t.commission) : "",
    r != null ? (r >= 0 ? "+" : "") + r.toFixed(2) + "R" : "",
  ].filter(Boolean).join(" · ");
  html += `<div class="review-pnl-card">
    <div><div class="review-pnl-num num ${pnlClass(t.netPnl)}">${money(t.netPnl)}</div><div class="dim small">${sub}</div></div>
    <div class="review-pnl-side dim small">
      ${[t.dir, t.contracts ? plural(+t.contracts, "contract") : ""].filter(Boolean).map(escapeHtml).join(" · ")}<br>
      ${[t.session, t.marketCondition].filter(Boolean).map(escapeHtml).join(" · ")}<br>
      ${dur != null ? "Hold " + fmtMins(dur) : ""}
    </div></div>`;

  const grid = [
    ["Entry (avg)", t.entry], ["Exit (avg)", t.exit], ["Stop (initial)", t.stop], ["Managed stop", t.managedStop],
    ["Target", t.target], ["R:R planned", t.rr], ["Ticks risked", t.ticksRisk], ["Catalyst", t.catalyst],
    ["Entry time", t.entryTime && fmtTime(t.entryTime, t.date, tz)], ["Exit time", t.exitTime && fmtTime(t.exitTime, t.date, tz)],
    ["Confidence", t.conf ? t.conf + " / 5" : ""], ["Emotion", t.emo],
  ].filter(x => x[1]);
  if (grid.length) {
    html += '<h3 class="review-sec">Trade details</h3><div class="review-grid">' +
      grid.map(([l, v]) => `<div class="review-stat"><div class="review-stat-lbl">${l}</div><div class="review-stat-val">${escapeHtml(v)}</div></div>`).join("") + "</div>";
  }
  if (t.legs && (t.legs.entry?.length > 1 || t.legs.exit?.length > 1)) {
    html += '<h3 class="review-sec">Legs</h3><div class="legs-grid">' + legsTable("Entries", t.legs.entry, "pos") + legsTable("Exits", t.legs.exit, "neg") + "</div>";
  }
  const blocks = [["Thesis", t.thesis], ["What actually happened", t.post], ["What you did right", t.right], ["Key lesson", t.lesson], ["Additional notes", t.notes]].filter(b => b[1]);
  if (blocks.length) {
    html += '<h3 class="review-sec">Review</h3>' + blocks.map(([l, v]) => `<div class="review-lbl">${l}</div><div class="review-block">${escapeHtml(v)}</div>`).join("");
  }
  html += '<h3 class="review-sec">Execution</h3>' + (t.mistake && t.mistake !== "None"
    ? `<span class="chip chip-mistake">${escapeHtml(t.mistake)}</span>`
    : '<span class="chip">No mistake tagged</span>');

  $("review-body").innerHTML = html;
  $("review-body").scrollTop = 0;
  const shot = $("review-body").querySelector(".review-screenshot");
  if (shot) showScreenshot(shot, t.chart, () => { shot.parentElement.hidden = true; });
  open();
}

/* Several trades on one heatmap day: list them, tap one to open it. */
export function showDay(date) {
  const trades = activeTrades().filter(t => t.date === date);
  if (!trades.length) return;
  if (trades.length === 1) { showTrade(trades[0].id); return; }
  S.reviewId = null;
  $("review-edit").hidden = true;
  $("review-delete").hidden = true;
  const pnl = trades.reduce((a, t) => a + t.netPnl, 0);
  const w = trades.filter(t => t.outcome === "W").length;
  $("review-title").innerHTML = `<span class="review-sym">${escapeHtml(date)}</span>
    <span class="dim small">${plural(trades.length, "trade")} · ${w}W ${trades.length - w}L</span>
    <span class="num strong ${pnlClass(pnl)}">${money(pnl)}</span>`;
  $("review-body").innerHTML = '<div class="day-list">' + trades
    .sort((a, b) => (a.entryTime || "").localeCompare(b.entryTime || ""))
    .map(t => `<button type="button" class="day-trade" data-id="${escapeHtml(t.id)}">
      <span><span class="sym">${escapeHtml(t.instrument || "—")}</span> <span class="dim">${escapeHtml(fmtTime(t.entryTime, t.date, S.cfg.timezone))} · ${escapeHtml(t.dir || "")}</span><br>
      <span class="dim small">${escapeHtml(t.strat || "No strategy")}</span></span>
      <span class="num strong ${pnlClass(t.netPnl)}">${money(t.netPnl)}</span></button>`).join("") + "</div>";
  open();
}

export function initDetail({ edit, remove }) {
  onEdit = edit;
  onDelete = remove;
  $("review-delete").addEventListener("click", () => onDelete(S.reviewId));
  $("review-overlay").addEventListener("click", closeDetail);
  $("review-close").addEventListener("click", closeDetail);
  $("review-edit").addEventListener("click", () => {
    const id = S.reviewId;
    closeDetail();
    onEdit(id);
  });
  $("review-body").addEventListener("click", e => {
    const shot = e.target.closest("[data-full]");
    if (shot) {
      const img = document.createElement("img");
      img.alt = "Trade screenshot, full size";
      showScreenshot(img, shot.dataset.full);
      $("fullscreen-img").replaceChildren(img);
      $("fullscreen-img").classList.add("open");
      return;
    }
    const day = e.target.closest(".day-trade");
    if (day) showTrade(day.dataset.id);
  });
  $("fullscreen-img").addEventListener("click", () => $("fullscreen-img").classList.remove("open"));
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("fullscreen-img").classList.contains("open")) $("fullscreen-img").classList.remove("open");
    else closeDetail();
  });
}
