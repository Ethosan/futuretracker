// Formatting: HTML escaping, money, dates, durations and times in a chosen time zone.
export function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch],
  );
}

export function money(value, { sign = true } = {}) {
  const num = Number(value) || 0;
  return (
    (num < 0 ? "-" : sign ? "+" : "") +
    "$" +
    Math.abs(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export const posNeg = (value) => (value >= 0 ? "pos" : "neg");

export const plural = (count, word) =>
  count + " " + word + (count === 1 ? "" : "s");

export function isoDate(date = new Date()) {
  const pad = (num) => String(num).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

export function parseIsoDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function duration(minutes) {
  if (minutes == null || isNaN(minutes)) {
    return "—";
  }
  if (minutes < 60) {
    return Math.round(minutes) + "m";
  }
  const mins = Math.round(minutes % 60);
  return Math.floor(minutes / 60) + "h" + (mins ? " " + mins + "m" : "");
}

export function timeIn(time, date, timeZone) {
  if (!time) {
    return "—";
  }
  if (!timeZone || !date) {
    return time;
  }
  try {
    return new Date(`${date}T${time}:00`).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    return time;
  }
}

export const splitList = (value) =>
  (value || "")
    .split(" | ")
    .map((item) => item.trim())
    .filter(Boolean);
