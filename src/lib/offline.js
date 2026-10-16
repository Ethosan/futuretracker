/* Offline support for the Google sheet modes (Sign in with Google, Apps Script).
   - Outbox: saves, edits and deletes made with no connection (or while Google
     sign-in has run out) wait here and are sent in order later.
   - Last copy: the trades from the last good load, so the app opens offline.
   Both live in this browser's localStorage and are removed on sign out.
   Device and demo modes don't need this: their trades are already local. */
import { normalizeTrade, pickColumns } from "./rows.js";

/* A request that never reached the server. Only these, or the browser saying
   it's offline, count as offline: a save that fails for any other reason
   should fail loudly, not sit in the outbox blocking everything after it. */
export class NetworkError extends Error {
  constructor(msg = "No connection") { super(msg); this.name = "NetworkError"; }
}
export function isOffline(e) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return e?.name === "NetworkError";
}
const isSignIn = e => e?.name === "NeedsSignIn";
const idOf = o => String(o.op === "remove" ? o.id : o.row.id);

export function createOutbox(storage, key = "tj_outbox") {
  const read = () => { try { return JSON.parse(storage.getItem(key)) || []; } catch { return []; } };
  const write = ops => (ops.length ? storage.setItem(key, JSON.stringify(ops)) : storage.removeItem(key));
  let running = null;

  async function send(target) {
    let sent = 0;
    const dropped = [];
    for (let ops = read(); ops.length; ops = read()) {
      const o = ops[0];
      try {
        await (o.op === "remove" ? target.remove(o.id) : target[o.op](o.row));
        sent++;
      } catch (e) {
        if (isOffline(e) || isSignIn(e)) return { sent, dropped, left: ops.length };
        dropped.push({ ...o, error: e.message });
      }
      /* Remove exactly the op that was sent (the outbox may have changed meanwhile). */
      const now = read();
      if (now.length && idOf(now[0]) === idOf(o) && now[0].op === o.op) write(now.slice(1));
    }
    return { sent, dropped, left: 0 };
  }

  return {
    list: read,
    size: () => read().length,
    has: id => read().some(o => idOf(o) === String(id)),
    clear: () => storage.removeItem(key),
    /* Queue one change, folding it into earlier ones for the same trade:
       an edit to an unsent new trade just changes that trade; a delete of
       an unsent new trade cancels both. */
    add(op) {
      const ops = read();
      const id = idOf(op);
      const i = ops.findIndex(o => idOf(o) === id);
      const prev = ops[i];
      if (prev?.op === "append" && op.op === "update") ops[i] = { op: "append", row: pickColumns(op.row) };
      else if (prev?.op === "append" && op.op === "remove") ops.splice(i, 1);
      else if (prev?.op === "update" && op.op !== "append") ops.splice(i, 1, op.op === "remove" ? { op: "remove", id } : { op: "update", row: pickColumns(op.row) });
      else ops.push(op.op === "remove" ? { op: "remove", id } : { op: op.op, row: pickColumns(op.row) });
      write(ops);
    },
    /* Send everything in order, one flush at a time. Stops (keeping the rest)
       when still offline or signed out; drops a change the sheet can't apply
       (e.g. the trade was deleted elsewhere) and reports it. */
    flush(target) {
      return (running ||= send(target).finally(() => { running = null; }));
    },
  };
}

/* Show the outbox on top of the last known trades. */
export function applyOutbox(trades, ops) {
  const out = new Map(trades.map(t => [t.id, t]));
  for (const o of ops) {
    if (o.op === "remove") out.delete(String(o.id));
    else out.set(String(o.row.id), { ...normalizeTrade(o.row), pending: true });
  }
  return [...out.values()];
}

/* Wrap a remote store. Writes that can't reach the sheet are queued instead
   of failing; loads fall back to the last copy. `stale` says the trades on
   screen are the saved copy, not fresh from the sheet. onFlush gets every
   flush result, so dropped changes are always reported. */
export function withOffline(inner, { storage, cacheKey = "tj_cache", outbox = createOutbox(storage), onFlush = () => {} }) {
  const saveCopy = trades => { try { storage.setItem(cacheKey, JSON.stringify(trades)); } catch { /* storage full: skip */ } };
  const lastCopy = () => { try { return JSON.parse(storage.getItem(cacheKey)) || []; } catch { return []; } };

  /* Replaying a queued new trade: it may have reached the sheet before the
     connection dropped, so try it as an edit first and only add it if it
     isn't there. No duplicate rows. */
  const replay = {
    append: async row => {
      try { return await inner.update(row); } catch (e) {
        if (!/not found/i.test(e.message)) throw e;
        return inner.append(row);
      }
    },
    update: row => inner.update(row),
    remove: id => inner.remove(id),
  };
  const flush = async () => {
    const res = await outbox.flush(replay);
    if (res.sent || res.dropped.length) onFlush(res);
    return res;
  };

  const queue = (op, arg) => {
    outbox.add(op === "remove" ? { op, id: arg } : { op, row: arg });
    return { status: "queued" };
  };
  /* A trade still waiting in the outbox can't be changed on the sheet yet:
     fold the change into the outbox instead. */
  const write = (op, arg, run) => {
    if (op !== "append" && outbox.has(op === "remove" ? arg : arg.id)) return Promise.resolve(queue(op, arg));
    return run().catch(e => {
      if (!isOffline(e) && !isSignIn(e)) throw e;
      return queue(op, arg);
    });
  };

  const wrapped = {
    ...inner,
    kind: inner.kind,
    outbox,
    stale: false,
    async loadTrades() {
      try {
        if (outbox.size()) await flush();
        const trades = await inner.loadTrades();
        saveCopy(trades);
        wrapped.stale = false;
        return applyOutbox(trades, outbox.list());
      } catch (e) {
        if (!isOffline(e) && !isSignIn(e)) throw e;
        wrapped.stale = true;
        if (isSignIn(e) && !lastCopy().length) throw e;
        return applyOutbox(lastCopy(), outbox.list());
      }
    },
    append: row => write("append", row, () => inner.append(row)),
    update: row => write("update", row, () => inner.update(row)),
    remove: id => write("remove", id, () => inner.remove(id)),
    async appendMany(rows) {
      if (!inner.appendMany) { for (const r of rows) await wrapped.append(r); return { status: "ok" }; }
      return inner.appendMany(rows).catch(e => {
        if (!isOffline(e) && !isSignIn(e)) throw e;
        rows.forEach(r => outbox.add({ op: "append", row: r }));
        return { status: "queued" };
      });
    },
    flush,
    forget() { outbox.clear(); storage.removeItem(cacheKey); },
  };
  return wrapped;
}
