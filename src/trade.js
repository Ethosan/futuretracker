// Trade maths and conversions: average fills, P&L, risk, R, validation, and sheet rows to and from trades.
import { COLUMNS, POINT_VALUE } from "./constants.js";

function averageFill(legs) {
  const total = legs.reduce((sum, leg) => sum + leg.contracts, 0);
  return total
    ? {
        avg:
          legs.reduce((sum, leg) => sum + leg.price * leg.contracts, 0) / total,
        total,
      }
    : null;
}

export function computeTrade({
  entryLegs,
  exitLegs,
  contracts,
  stop,
  target,
  instrument,
  dir,
  commission,
}) {
  const entryFill = averageFill(entryLegs),
    exitFill = averageFill(exitLegs),
    entry = entryFill ? entryFill.avg : 0,
    exit = exitFill ? exitFill.avg : 0,
    qty = entryFill ? entryFill.total : parseInt(contracts, 10) || 0,
    pointValue = POINT_VALUE[instrument] || 1,
    isShort = dir === "Short",
    out = {
      entry: entry || null,
      exit: exit || null,
      contracts: qty,
      ticks: null,
      maxRisk: null,
      rr: null,
      gross: null,
      net: null,
      r: null,
    };
  if (entry && stop && entry !== stop) {
    out.ticks = Math.abs(entry - stop);
    out.maxRisk = out.ticks * pointValue * qty;
    if (target) {
      out.rr = Math.abs(target - entry) / Math.abs(entry - stop);
    }
  }
  if (entry && exit) {
    let gross = 0;
    if (exitLegs.length && entryLegs.length) {
      for (const leg of exitLegs) {
        gross +=
          (isShort ? entry - leg.price : leg.price - entry) *
          pointValue *
          leg.contracts;
      }
    } else {
      gross = (isShort ? entry - exit : exit - entry) * pointValue * qty;
    }
    out.gross = gross;
    out.net = gross - (Number(commission) || 0);
    if (out.maxRisk) {
      out.r = out.net / out.maxRisk;
    }
  }
  return out;
}

export function minutesBetween(start, end) {
  if (!start || !end) {
    return null;
  }
  const [startH, startM] = start.split(":").map(Number),
    [endH, endM] = end.split(":").map(Number);
  let minutes = endH * 60 + endM - (startH * 60 + startM);
  if (minutes < 0) {
    minutes += 1440;
  }
  return minutes;
}

const LEGS_MARKER = "__LEGS__";

export function packLegs(notes, entryLegs, exitLegs) {
  if (entryLegs.length <= 1 && exitLegs.length <= 1) {
    return notes;
  }
  const json = JSON.stringify({
    entry: entryLegs,
    exit: exitLegs,
  });
  return notes
    ? notes +
        `
` +
        LEGS_MARKER +
        json
    : LEGS_MARKER + json;
}

function unpackLegs(notes) {
  if (!notes) {
    return {
      notes: "",
      legs: null,
    };
  }
  const at = notes.indexOf(LEGS_MARKER);
  if (at === -1) {
    return {
      notes,
      legs: null,
    };
  }
  try {
    return {
      notes: notes.slice(0, at).trim(),
      legs: JSON.parse(notes.slice(at + LEGS_MARKER.length)),
    };
  } catch {
    return {
      notes,
      legs: null,
    };
  }
}

function maxRiskOf(trade) {
  const entry = parseFloat(trade.entry),
    stop = parseFloat(trade.stop),
    contracts = parseInt(trade.contracts, 10) || 0;
  return !entry || !stop || entry === stop || !contracts
    ? null
    : Math.abs(entry - stop) * (POINT_VALUE[trade.instrument] || 1) * contracts;
}

export function rMultipleOf(trade) {
  const risk = maxRiskOf(trade);
  return risk ? trade.netPnl / risk : null;
}

export const outcomeOf = (pnl) => (pnl > 0 ? "W" : pnl < 0 ? "L" : "BE");

export function validateTrade({
  instrument,
  dir,
  entryLegs,
  exitLegs,
  stop,
  target,
}) {
  const errors = [],
    add = (field, message) =>
      errors.push({
        field,
        message,
      });
  if (!instrument) {
    add("f-instrument", "Pick an instrument.");
  }
  if (dir !== "Long" && dir !== "Short") {
    add(
      "f-dir",
      "Pick Long or Short. It decides whether price going up is a win.",
    );
  }
  if (!entryLegs.length) {
    add("entry-legs", "Add an entry price.");
  }
  if (!exitLegs.length) {
    add("exit-legs", "Add an exit price.");
  }
  const entryFill = averageFill(entryLegs);
  if (entryFill && exitLegs.length) {
    const exited = exitLegs.reduce((sum, leg) => sum + leg.contracts, 0);
    if (exited > entryFill.total) {
      add(
        "exit-legs",
        `You exited ${exited} contracts but only entered ${entryFill.total}.`,
      );
    }
  }
  if (entryFill && (dir === "Long" || dir === "Short")) {
    const isLong = dir === "Long";
    if (stop && (isLong ? stop >= entryFill.avg : stop <= entryFill.avg)) {
      add(
        "f-stop",
        `For a ${dir.toLowerCase()}, the stop goes ${isLong ? "below" : "above"} the entry (${entryFill.avg.toFixed(2)}).`,
      );
    }
    if (
      target &&
      (isLong ? target <= entryFill.avg : target >= entryFill.avg)
    ) {
      add(
        "f-target",
        `For a ${dir.toLowerCase()}, the target goes ${isLong ? "above" : "below"} the entry (${entryFill.avg.toFixed(2)}).`,
      );
    }
  }
  return errors;
}

const toNumber = (value) =>
  parseFloat(String(value ?? "").replace(/[$,]/g, "")) || 0;

export function normalizeTrade(raw) {
  const { notes, legs } = unpackLegs(raw.notes || "");
  return {
    ...raw,
    id: String(raw.id),
    netPnl: toNumber(raw.netPnl),
    grossPnl: toNumber(raw.grossPnl),
    conf: parseInt(raw.conf, 10) || 0,
    notes,
    legs,
  };
}

export function rowsToTrades(rows) {
  if (rows.length <= 1) {
    return [];
  }
  const [header, ...data] = rows;
  return data
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) =>
      normalizeTrade(
        Object.fromEntries(header.map((key, col) => [key, row[col] ?? ""])),
      ),
    );
}

const FORMULA_START = /^[=+@\t\r]|^-(?![\d.]+$)/;

export const isFormulaLike = (value) =>
  typeof value == "string" && value !== "-" && FORMULA_START.test(value);

export const escapeFormula = (value) =>
  isFormulaLike(value) ? "'" + value : value;

export const pickColumns = (trade) =>
  Object.fromEntries(COLUMNS.map((key) => [key, trade[key] ?? ""]));

export function tradeToRow(trade) {
  const row = pickColumns(trade);
  row.notes = packLegs(
    trade.notes || "",
    trade.legs?.entry || [],
    trade.legs?.exit || [],
  );
  for (const key of COLUMNS) {
    row[key] = String(row[key] ?? "");
  }
  return row;
}
