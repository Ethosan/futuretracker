/* Column order in the Google Sheet. Never reorder: existing sheets depend on it.
   New fields go at the end. */
export const COLS = [
  "id", "date", "entryTime", "instrument", "account", "dir", "session", "marketCondition", "contracts",
  "entry", "stop", "target", "rr", "ticksRisk", "catalyst", "strat", "ct", "thesis", "conf", "emo",
  "exit", "exitTime", "managedStop", "grossPnl", "commission", "netPnl", "outcome", "post", "right",
  "lesson", "mistake", "chart", "notes",
];

/* Dollars per one full point, per contract. */
export const POINT_VALUE = { MES: 5, MNQ: 2, MGC: 10, XAUUSD: 1 };
export const INSTRUMENTS = Object.keys(POINT_VALUE);
export const ACCOUNTS = ["Live", "Prop"];
export const SESSIONS = ["Asia", "London", "NY AM", "NY PM", "Overnight"];
export const CONDITIONS = ["Trending", "Ranging", "Choppy", "News-driven"];

export const STRATEGIES = [
  "ORB", "VWAP reclaim", "VWAP rejection", "Trend continuation", "Mean reversion", "Breakout",
  "Fade/reversal", "Support/resistance", "News/macro play", "Gap fill", "ICT/SMC", "Vectors", "Scalp",
];

export const MISTAKES = [
  "Moved stop", "Chased entry", "Oversized", "Held too long", "Exited early",
  "No clear setup", "Revenge trade", "FOMO entry", "Overtraded", "None",
];

export const OUTCOMES = [
  { value: "W", label: "Win", cls: "win" },
  { value: "L", label: "Loss", cls: "loss" },
  { value: "BE", label: "BE", cls: "be" },
];

export const TIMEZONES = [
  ["Local (device default)", ""],
  ["UTC", "UTC"],
  ["Singapore / HKT (UTC+8)", "Asia/Singapore"],
  ["Tokyo (UTC+9)", "Asia/Tokyo"],
  ["Sydney (UTC+10/11)", "Australia/Sydney"],
  ["Dubai (UTC+4)", "Asia/Dubai"],
  ["London (UTC+0/1)", "Europe/London"],
  ["Paris / Frankfurt (UTC+1/2)", "Europe/Paris"],
  ["New York (UTC-5/4)", "America/New_York"],
  ["Chicago (UTC-6/5)", "America/Chicago"],
  ["Los Angeles (UTC-8/7)", "America/Los_Angeles"],
];

/* How long a loaded trade list is reused before going back to the sheet. */
export const CACHE_TTL = 60_000;
