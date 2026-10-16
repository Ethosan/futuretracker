/* Offline support for the Google sheet modes (Sign in with Google, Apps Script).
   - Outbox: saves, edits and deletes made with no connection (or while Google
     sign-in has run out) wait here and are sent in order later.
   - Last copy: the trades from the last good load, so the app opens offline.
   Both live in this browser's localStorage and are removed on sign out.
   Device and demo modes don't need this: their trades are already local. */
import { normalizeTrade, pickColumns } from "./rows.js";

/* No connection, or the request never got an answer. */
export function isOffline(e) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return e instanceof TypeError || e?.message === "Timeout" || e?.message === "Script error";
}
const isSignIn = e => e?.name === "NeedsSignIn";

export function createOutbox(storage, key = "tj_outbox") {
  const read = () => { try { return JSON.parse(storage.getItem(key)) || []; } catch { return []; } };
  const write = ops => (ops.length ? storage.setItem(key, JSON.stringify(ops)) : storage.removeItem(key));
  return {
    list: read,
    size: () => read().length,
    clear: () => storage.removeItem(key),
    /* Queue one change, folding it into earlier ones for the same trade:
       an edit to an unsent new trade just changes that trade; a delete of
       an unsent new trade cancels both. */
    add(op) {
      const ops = read();
      const id = String(op.op === "remove" ? op.id : op.row.id);
      const i = ops.findIndex(o => String(o.op === "remove" ? o.id : o.row.id) === id);
      const prev = ops[i];
      if (prev?.op === "append" && op.op === "update") ops[i] = { op: "append", row: pickColumns(op.row) };
      else if (prev?.op === "append" && op.op === "remove") ops.splice(i, 1);
      else if (prev?.op === "update" && op.op !== "append") ops.splice(i, 1, op.op === "remove" ? { op: "remove", id } : { op: "update", row: pickColumns(op.row) });
      else ops.push(op.op === "remove" ? { op: "remove", id } : { op: op.op, row: pickColumns(op.row) });
      write(ops);
    },
    /* Send everything in order. Stops (keeping the rest) when still offline
       or signed out; drops a change the sheet can't apply (e.g. the trade
       was already deleted elsewhere) and reports it. */
    async flush(target) {
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
        write(read().slice(1));
      }
      return { sent, dropped, left: 0 };
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
   screen are the saved copy, not fresh from the sheet. */
export function withOffline(inner, { storage, cacheKey = "tj_cache", outbox = createOutbox(storage) }) {
  const saveCopy = trades => { try { storage.setItem(cacheKey, JSON.stringify(trades)); } catch { /* storage full: skip */ } };
  const lastCopy = () => { try { return JSON.parse(storage.getItem(cacheKey)) || []; } catch { return []; } };
  const queueOr = (op, arg, run) => run().catch(e => {
    if (!isOffline(e) && !isSignIn(e)) throw e;
    outbox.add(op === "remove" ? { op, id: arg } : { op, row: arg });
    return { status: "queued" };
  });

  const wrapped = {
    ...inner,
    kind: inner.kind,
    outbox,
    stale: false,
    async loadTrades() {
      try {
        if (outbox.size()) await outbox.flush(inner);
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
    append: row => queueOr("append", row, () => inner.append(row)),
    update: row => queueOr("update", row, () => inner.update(row)),
    remove: id => queueOr("remove", id, () => inner.remove(id)),
    flush: () => outbox.flush(inner),
    forget() { outbox.clear(); storage.removeItem(cacheKey); },
  };
  return wrapped;
}
