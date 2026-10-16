export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* +$12.50 / -$3.00 */
export function money(v, { sign = true } = {}) {
  const n = Number(v) || 0;
  const s = n < 0 ? "-" : sign ? "+" : "";
  return s + "$" + Math.abs(n).toFixed(2);
}

export const pnlClass = v => (v >= 0 ? "pos" : "neg");

export const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

/* Today's date as YYYY-MM-DD in the device's own timezone (not UTC). */
export function localISODate(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* Parse YYYY-MM-DD as a local calendar date. */
export function parseLocalDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtMins(m) {
  if (m == null || isNaN(m)) return "—";
  if (m < 60) return Math.round(m) + "m";
  const rest = Math.round(m % 60);
  return Math.floor(m / 60) + "h" + (rest ? " " + rest + "m" : "");
}

/* Shows an HH:MM entry time in the chosen display timezone. */
export function fmtTime(timeStr, dateStr, tz) {
  if (!timeStr) return "—";
  if (!tz || !dateStr) return timeStr;
  try {
    return new Date(`${dateStr}T${timeStr}:00`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz });
  } catch {
    return timeStr;
  }
}

export const splitStrats = s => (s || "").split(" | ").map(x => x.trim()).filter(Boolean);
