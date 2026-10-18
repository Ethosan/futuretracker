// The side panel that shows one trade, or every trade of one day.
import { duration, esc, money, plural, posNeg, timeIn } from "../format.js";
import { showImage } from "../screenshots.js";
import { state, tradeById, visibleTrades } from "../state.js";
import { minutesBetween, rMultipleOf } from "../trade.js";
import { $ } from "../ui.js";

let onEdit = () => {};

let onDelete = () => {};

let returnFocus = null;

const reviewOutcomeClass = (outcome) =>
  outcome === "W" ? "out-w" : outcome === "L" ? "out-l" : "out-be";

function openPanel() {
  returnFocus = document.activeElement;
  $("review-overlay").classList.add("open");
  $("review-panel").classList.add("open");
  $("review-panel").setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
  $("review-close").focus();
}

export function closeReview() {
  if ($("review-panel").classList.contains("open")) {
    $("review-overlay").classList.remove("open");
    $("review-panel").classList.remove("open");
    $("review-panel").setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    returnFocus?.focus?.();
  }
}

function legsBlock(title, legs, cls) {
  return `<div><div class="legs-head ${cls}">${title}</div>${(legs || []).map((leg, index) => `<div class="leg-line"><span class="dim">Leg ${index + 1}</span><span class="num">${esc(leg.price)} × ${plural(leg.contracts, "lot")}</span></div>`).join("")}</div>`;
}

export function openReview(id) {
  const trade = tradeById(id);
  if (!trade) {
    return;
  }
  state.reviewId = trade.id;
  $("review-edit").hidden = false;
  $("review-delete").hidden = false;
  const timeZone = state.cfg.timezone,
    holdMin = minutesBetween(trade.entryTime, trade.exitTime),
    r = rMultipleOf(trade);
  $("review-title").innerHTML = `
    <span class="review-sym">${esc(trade.instrument || "—")}</span>
    ${trade.account ? `<span class="account-badge ${trade.account === "Live" ? "badge-live" : "badge-prop"}">${esc(trade.account)}</span>` : ""}
    <span class="chip chip-strat">${esc(trade.strat || "No strategy")}</span>
    ${trade.ct ? `<span class="ct-name">${esc(trade.ct)}</span>` : ""}
    <span class="out-tag big ${reviewOutcomeClass(trade.outcome)}">${esc(trade.outcome || "—")}</span>
    <span class="dim small">${esc(trade.date)}${trade.entryTime ? " · " + esc(timeIn(trade.entryTime, trade.date, timeZone)) : ""}</span>`;
  let html = "";
  if (trade.chart) {
    html += `<button type="button" class="shot-btn" data-full="${esc(trade.chart)}" aria-label="View screenshot full size"><img class="review-screenshot" alt="Trade screenshot"></button>`;
  }
  const pnlNote = [
    "Net P&amp;L",
    trade.grossPnl ? "Gross " + money(trade.grossPnl) : "",
    trade.commission ? "Commission $" + esc(trade.commission) : "",
    r != null ? (r >= 0 ? "+" : "") + r.toFixed(2) + "R" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  html += `<div class="review-pnl-card">
    <div><div class="review-pnl-num num ${posNeg(trade.netPnl)}">${money(trade.netPnl)}</div><div class="dim small">${pnlNote}</div></div>
    <div class="review-pnl-side dim small">
      ${[trade.dir, trade.contracts ? plural(+trade.contracts, "contract") : ""].filter(Boolean).map(esc).join(" · ")}<br>
      ${[trade.session, trade.marketCondition].filter(Boolean).map(esc).join(" · ")}<br>
      ${holdMin != null ? "Hold " + duration(holdMin) : ""}
    </div></div>`;
  const details = [
    ["Entry (avg)", trade.entry],
    ["Exit (avg)", trade.exit],
    ["Stop (initial)", trade.stop],
    ["Managed stop", trade.managedStop],
    ["Target", trade.target],
    ["R:R planned", trade.rr],
    ["Ticks risked", trade.ticksRisk],
    ["Catalyst", trade.catalyst],
    [
      "Entry time",
      trade.entryTime && timeIn(trade.entryTime, trade.date, timeZone),
    ],
    [
      "Exit time",
      trade.exitTime && timeIn(trade.exitTime, trade.date, timeZone),
    ],
    ["Confidence", trade.conf ? trade.conf + " / 5" : ""],
    ["Emotion", trade.emo],
  ].filter((row) => row[1]);
  if (details.length) {
    html +=
      '<h3 class="review-sec">Trade details</h3><div class="review-grid">' +
      details
        .map(
          ([label, value]) =>
            `<div class="review-stat"><div class="review-stat-lbl">${label}</div><div class="review-stat-val">${esc(value)}</div></div>`,
        )
        .join("") +
      "</div>";
  }
  if (
    trade.legs &&
    (trade.legs.entry?.length > 1 || trade.legs.exit?.length > 1)
  ) {
    html +=
      '<h3 class="review-sec">Legs</h3><div class="legs-grid">' +
      legsBlock("Entries", trade.legs.entry, "pos") +
      legsBlock("Exits", trade.legs.exit, "neg") +
      "</div>";
  }
  const notes = [
    ["Thesis", trade.thesis],
    ["What actually happened", trade.post],
    ["What you did right", trade.right],
    ["Key lesson", trade.lesson],
    ["Additional notes", trade.notes],
  ].filter((row) => row[1]);
  if (notes.length) {
    html +=
      '<h3 class="review-sec">Review</h3>' +
      notes
        .map(
          ([label, value]) =>
            `<div class="review-lbl">${label}</div><div class="review-block">${esc(value)}</div>`,
        )
        .join("");
  }
  html +=
    '<h3 class="review-sec">Execution</h3>' +
    (trade.mistake && trade.mistake !== "None"
      ? `<span class="chip chip-mistake">${esc(trade.mistake)}</span>`
      : '<span class="chip">No mistake tagged</span>');
  $("review-body").innerHTML = html;
  $("review-body").scrollTop = 0;
  const shot = $("review-body").querySelector(".review-screenshot");
  if (shot) {
    showImage(shot, trade.chart, () => {
      shot.parentElement.hidden = true;
    });
  }
  openPanel();
}

export function openDay(date) {
  const trades = visibleTrades().filter((trade) => trade.date === date);
  if (!trades.length) {
    return;
  }
  if (trades.length === 1) {
    openReview(trades[0].id);
    return;
  }
  state.reviewId = null;
  $("review-edit").hidden = true;
  $("review-delete").hidden = true;
  const pnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0),
    wins = trades.filter((trade) => trade.outcome === "W").length;
  $("review-title").innerHTML = `<span class="review-sym">${esc(date)}</span>
    <span class="dim small">${plural(trades.length, "trade")} · ${wins}W ${trades.length - wins}L</span>
    <span class="num strong ${posNeg(pnl)}">${money(pnl)}</span>`;
  $("review-body").innerHTML =
    '<div class="day-list">' +
    trades
      .sort((a, b) => (a.entryTime || "").localeCompare(b.entryTime || ""))
      .map(
        (
          trade,
        ) => `<button type="button" class="day-trade" data-id="${esc(trade.id)}">
      <span><span class="sym">${esc(trade.instrument || "—")}</span> <span class="dim">${esc(timeIn(trade.entryTime, trade.date, state.cfg.timezone))} · ${esc(trade.dir || "")}</span><br>
      <span class="dim small">${esc(trade.strat || "No strategy")}</span></span>
      <span class="num strong ${posNeg(trade.netPnl)}">${money(trade.netPnl)}</span></button>`,
      )
      .join("") +
    "</div>";
  openPanel();
}

export function setupReviewPanel({ edit, remove }) {
  onEdit = edit;
  onDelete = remove;
  $("review-delete").addEventListener("click", () => onDelete(state.reviewId));
  $("review-overlay").addEventListener("click", closeReview);
  $("review-close").addEventListener("click", closeReview);
  $("review-edit").addEventListener("click", () => {
    const id = state.reviewId;
    closeReview();
    onEdit(id);
  });
  $("review-body").addEventListener("click", (event) => {
    const shotBtn = event.target.closest("[data-full]");
    if (shotBtn) {
      const img = document.createElement("img");
      img.alt = "Trade screenshot, full size";
      showImage(img, shotBtn.dataset.full);
      $("fullscreen-img").replaceChildren(img);
      $("fullscreen-img").classList.add("open");
      return;
    }
    const dayTrade = event.target.closest(".day-trade");
    if (dayTrade) {
      openReview(dayTrade.dataset.id);
    }
  });
  $("fullscreen-img").addEventListener("click", () =>
    $("fullscreen-img").classList.remove("open"),
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if ($("fullscreen-img").classList.contains("open")) {
        $("fullscreen-img").classList.remove("open");
      } else {
        closeReview();
      }
    }
  });
}
