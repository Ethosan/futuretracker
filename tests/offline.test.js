import { describe, expect, it } from "vitest";
import { createOutbox, applyOutbox, withOffline, isOffline, NetworkError } from "../src/lib/offline.js";
import { createMemoryStore } from "../src/lib/stores.js";
import { NeedsSignIn } from "../src/lib/google.js";
import { generateDemoRows } from "../src/lib/demo.js";
import { normalizeTrade } from "../src/lib/rows.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), keys: () => [...m.keys()] };
}
const [a, b, c] = generateDemoRows().slice(0, 3);

/* A sheet store whose network can be switched off. */
function flaky(rows = []) {
  const inner = createMemoryStore(rows);
  const s = { online: true, signedIn: true, kind: "google" };
  const gate = fn => async (...args) => {
    if (!s.online) throw new NetworkError();
    if (!s.signedIn) throw new NeedsSignIn();
    return fn(...args);
  };
  for (const k of ["ensureHeaders", "loadTrades", "append", "update", "remove"]) s[k] = gate(inner[k].bind(inner));
  return s;
}

describe("outbox", () => {
  it("folds changes to the same trade together", () => {
    const o = createOutbox(fakeStorage());
    o.add({ op: "append", row: a });
    o.add({ op: "update", row: { ...a, netPnl: "1.00" } });
    expect(o.list()).toEqual([{ op: "append", row: expect.objectContaining({ id: a.id, netPnl: "1.00" }) }]);
    o.add({ op: "remove", id: a.id });
    expect(o.list()).toEqual([]); // never reached the sheet, so nothing to send
    o.add({ op: "update", row: b });
    o.add({ op: "remove", id: b.id });
    expect(o.list()).toEqual([{ op: "remove", id: b.id }]);
  });

  it("knows what counts as offline", () => {
    expect(isOffline(new NetworkError())).toBe(true);
    // a bug or a slow server is not "offline": those should fail loudly, not block the outbox
    expect(isOffline(new TypeError("x is undefined"))).toBe(false);
    expect(isOffline(new Error("Timeout"))).toBe(false);
    expect(isOffline(new Error("Trade not found"))).toBe(false);
  });

  it("applies queued changes on top of the last copy", () => {
    const trades = [a, b].map(normalizeTrade);
    const shown = applyOutbox(trades, [{ op: "remove", id: a.id }, { op: "append", row: c }]);
    expect(shown.map(t => t.id)).toEqual([b.id, c.id]);
    expect(shown[1].pending).toBe(true);
  });
});

describe("working offline", () => {
  it("queues saves, shows the last copy, and sends everything when back online", async () => {
    const storage = fakeStorage();
    const net = flaky([a]);
    const s = withOffline(net, { storage });
    expect((await s.loadTrades()).map(t => t.id)).toEqual([a.id]);

    net.online = false;
    expect(await s.append(b)).toEqual({ status: "queued" });
    expect(await s.update({ ...a, netPnl: "9.00" })).toEqual({ status: "queued" });
    const offline = await s.loadTrades();
    expect(s.stale).toBe(true);
    expect(offline.map(t => [t.id, t.netPnl, !!t.pending])).toEqual([[a.id, 9, true], [b.id, normalizeTrade(b).netPnl, true]]);

    net.online = true;
    expect(await s.flush()).toEqual({ sent: 2, dropped: [], left: 0 });
    const back = await s.loadTrades();
    expect(s.stale).toBe(false);
    expect(back.map(t => [t.id, t.netPnl, !!t.pending])).toEqual([[a.id, 9, false], [b.id, normalizeTrade(b).netPnl, false]]);
  });

  it("an expired Google sign-in queues too, and keeps the order", async () => {
    const net = flaky([a]);
    const s = withOffline(net, { storage: fakeStorage() });
    net.signedIn = false;
    await s.remove(a.id);
    await s.append(c);
    expect((await s.flush()).left).toBe(2); // still signed out: nothing lost
    net.signedIn = true;
    expect((await s.flush()).sent).toBe(2);
    expect((await net.loadTrades()).map(t => t.id)).toEqual([c.id]);
  });

  it("drops a change the sheet can't apply and says why", async () => {
    const net = flaky([]);
    const s = withOffline(net, { storage: fakeStorage() });
    net.online = false;
    await s.update(a); // a isn't in the sheet
    net.online = true;
    const res = await s.flush();
    expect(res.sent).toBe(0);
    expect(res.dropped[0].error).toMatch(/not found/);
    expect(s.outbox.size()).toBe(0);
  });

  it("real errors still fail loudly, and forget() leaves nothing behind", async () => {
    const storage = fakeStorage();
    const s = withOffline(flaky([a]), { storage });
    await expect(s.update(b)).rejects.toThrow("not found");
    await s.loadTrades();
    expect(storage.keys()).toContain("tj_cache");
    s.forget();
    expect(storage.keys()).toEqual([]);
  });

  it("two syncs at once send each change once", async () => {
    const net = flaky([]);
    const s = withOffline(net, { storage: fakeStorage() });
    net.online = false;
    await s.append(b);
    await s.append(c);
    net.online = true;
    const [r1, r2] = await Promise.all([s.flush(), s.flush()]);
    expect(r1).toBe(r2);
    expect((await net.loadTrades()).map(t => t.id)).toEqual([b.id, c.id]);
  });

  it("a queued trade that already reached the sheet isn't added twice", async () => {
    const net = flaky([]);
    const s = withOffline(net, { storage: fakeStorage() });
    s.outbox.add({ op: "append", row: b }); // as if the reply was lost after the sheet saved it
    await net.append(b);
    await s.flush();
    expect((await net.loadTrades()).map(t => t.id)).toEqual([b.id]);
  });

  it("editing or deleting a trade that hasn't synced yet works while online", async () => {
    const net = flaky([]);
    const s = withOffline(net, { storage: fakeStorage() });
    net.online = false;
    await s.append(b);
    net.online = true;
    expect(await s.update({ ...b, netPnl: "3.00" })).toEqual({ status: "queued" });
    await s.flush();
    expect((await net.loadTrades())[0].netPnl).toBe(3);
    net.online = false;
    await s.append(c);
    net.online = true;
    await s.remove(c.id);
    expect(s.outbox.size()).toBe(0);
  });

  it("a real error is not queued, and every flush is reported", async () => {
    const reports = [];
    const net = flaky([a]);
    const realUpdate = net.update;
    net.update = async () => { throw new TypeError("bug"); };
    const s = withOffline(net, { storage: fakeStorage(), onFlush: r => reports.push(r) });
    await expect(s.update(a)).rejects.toThrow("bug");
    expect(s.outbox.size()).toBe(0);
    net.update = realUpdate;
    net.online = false;
    await s.append(b);
    net.online = true;
    await s.loadTrades(); // the load flushes first
    expect(reports).toEqual([{ sent: 1, dropped: [], left: 0 }]);
  });

  it("imports many rows in one request, or queues them all offline", async () => {
    const net = flaky([]);
    let calls = 0;
    net.appendMany = async rows => { calls++; for (const r of rows) await net.append(r); };
    const s = withOffline(net, { storage: fakeStorage() });
    await s.appendMany([a, b]);
    expect(calls).toBe(1);
    net.online = false;
    net.appendMany = async () => { throw new NetworkError(); };
    expect(await s.appendMany([c])).toEqual({ status: "queued" });
    expect(s.outbox.size()).toBe(1);
  });
});
