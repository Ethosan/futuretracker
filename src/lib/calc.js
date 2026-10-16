/* Trade maths for the Log Trade form. Pure functions, unit tested. */
import { POINT_VALUE } from "../config.js";

/* Size-weighted average price of legs: [{ price, contracts }]. */
export function weightedAvg(legs) {
  const total = legs.reduce((a, l) => a + l.contracts, 0);
  if (!total) return null;
  return { avg: legs.reduce((a, l) => a + l.price * l.contracts, 0) / total, total };
}

/* Everything the form derives from what was typed.
   P&L pairs each exit leg against the weighted average entry. */
export function computeTrade({ entryLegs, exitLegs, contracts, stop, target, instrument, dir, commission }) {
  const entry = weightedAvg(entryLegs);
  const exit = weightedAvg(exitLegs);
  const e = entry ? entry.avg : 0;
  const x = exit ? exit.avg : 0;
  const size = entry ? entry.total : (parseInt(contracts, 10) || 0);
  const pv = POINT_VALUE[instrument] || 1;
  const short = dir === "Short";
  const out = { entry: e || null, exit: x || null, contracts: size, ticks: null, maxRisk: null, rr: null, gross: null, net: null, r: null };

  if (e && stop && e !== stop) {
    out.ticks = Math.abs(e - stop);
    out.maxRisk = out.ticks * pv * size;
    if (target) out.rr = Math.abs(target - e) / Math.abs(e - stop);
  }

  if (e && x) {
    let gross = 0;
    if (exitLegs.length && entryLegs.length) {
      for (const leg of exitLegs) gross += (short ? e - leg.price : leg.price - e) * pv * leg.contracts;
    } else {
      gross = (short ? e - x : x - e) * pv * size;
    }
    out.gross = gross;
    out.net = gross - (Number(commission) || 0);
    if (out.maxRisk) out.r = out.net / out.maxRisk;
  }
  return out;
}

/* Minutes between HH:MM times, wrapping past midnight. */
export function durationMinutes(entryTime, exitTime) {
  if (!entryTime || !exitTime) return null;
  const [eh, em] = entryTime.split(":").map(Number);
  const [xh, xm] = exitTime.split(":").map(Number);
  let m = (xh * 60 + xm) - (eh * 60 + em);
  if (m < 0) m += 1440;
  return m;
}

/* Multi-leg detail is stored at the end of the notes column so the sheet
   layout never changes: "<notes>\n__LEGS__{...}". */
const LEGS_MARK = "__LEGS__";

export function encodeNotesWithLegs(notes, entryLegs, exitLegs) {
  if (entryLegs.length <= 1 && exitLegs.length <= 1) return notes;
  const json = JSON.stringify({ entry: entryLegs, exit: exitLegs });
  return notes ? notes + "\n" + LEGS_MARK + json : LEGS_MARK + json;
}

export function decodeNotesWithLegs(notes) {
  if (!notes) return { notes: "", legs: null };
  const idx = notes.indexOf(LEGS_MARK);
  if (idx === -1) return { notes, legs: null };
  try {
    return { notes: notes.slice(0, idx).trim(), legs: JSON.parse(notes.slice(idx + LEGS_MARK.length)) };
  } catch {
    return { notes, legs: null };
  }
}

/* Planned risk in dollars for a saved trade, or null. Used for R-multiples. */
export function plannedRisk(t) {
  const e = parseFloat(t.entry), s = parseFloat(t.stop), n = parseInt(t.contracts, 10) || 0;
  if (!e || !s || e === s || !n) return null;
  return Math.abs(e - s) * (POINT_VALUE[t.instrument] || 1) * n;
}

export function rMultiple(t) {
  const risk = plannedRisk(t);
  return risk ? t.netPnl / risk : null;
}

/* Outcome from net P&L, for when the user doesn't pick one. */
export const outcomeFor = net => (net > 0 ? "W" : net < 0 ? "L" : "BE");

/* What's missing or contradictory before a trade can be saved.
   Returns [{ field, message }], empty when the trade is fine. */
export function validateTrade({ instrument, dir, entryLegs, exitLegs, stop, target }) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (!instrument) add("f-instrument", "Pick an instrument.");
  if (dir !== "Long" && dir !== "Short") add("f-dir", "Pick Long or Short. It decides whether price going up is a win.");
  if (!entryLegs.length) add("entry-legs", "Add an entry price.");
  if (!exitLegs.length) add("exit-legs", "Add an exit price.");
  const entry = weightedAvg(entryLegs);
  if (entry && exitLegs.length) {
    const out = exitLegs.reduce((a, l) => a + l.contracts, 0);
    if (out > entry.total) add("exit-legs", `You exited ${out} contracts but only entered ${entry.total}.`);
  }
  if (entry && (dir === "Long" || dir === "Short")) {
    const long = dir === "Long";
    if (stop && (long ? stop >= entry.avg : stop <= entry.avg)) add("f-stop", `For a ${dir.toLowerCase()}, the stop goes ${long ? "below" : "above"} the entry (${entry.avg.toFixed(2)}).`);
    if (target && (long ? target <= entry.avg : target >= entry.avg)) add("f-target", `For a ${dir.toLowerCase()}, the target goes ${long ? "above" : "below"} the entry (${entry.avg.toFixed(2)}).`);
  }
  return errors;
}
