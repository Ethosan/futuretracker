// Offline support for sheet backends: cached trades and an outbox of changes sent when back online.
import { normalizeTrade, pickColumns } from "../trade.js";

export class NetworkError extends Error {
  constructor(message = "No connection") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isOffline(err) {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? true
    : err?.name === "NetworkError";
}

const needsSignIn = (err) => err?.name === "NeedsSignIn";

const opKey = (op) => String(op.op === "remove" ? op.id : op.row.id);

function createOutbox(storage, key = "tj_outbox") {
  const list = () => {
      try {
        return JSON.parse(storage.getItem(key)) || [];
      } catch {
        return [];
      }
    },
    save = (ops) =>
      ops.length
        ? storage.setItem(key, JSON.stringify(ops))
        : storage.removeItem(key);
  let flushing = null;
  async function drain(store) {
    let sent = 0;
    const dropped = [];
    for (let queue = list(); queue.length; queue = list()) {
      const op = queue[0];
      try {
        await (op.op === "remove" ? store.remove(op.id) : store[op.op](op.row));
        sent++;
      } catch (err) {
        if (isOffline(err) || needsSignIn(err)) {
          return {
            sent,
            dropped,
            left: queue.length,
          };
        }
        dropped.push({
          ...op,
          error: err.message,
        });
      }
      const now = list();
      if (now.length && opKey(now[0]) === opKey(op) && now[0].op === op.op) {
        save(now.slice(1));
      }
    }
    return {
      sent,
      dropped,
      left: 0,
    };
  }
  return {
    list,
    size: () => list().length,
    has: (id) => list().some((op) => opKey(op) === String(id)),
    clear: () => storage.removeItem(key),
    add(op) {
      const queue = list(),
        key = opKey(op),
        index = queue.findIndex((queued) => opKey(queued) === key),
        existing = queue[index];
      if (existing?.op === "append" && op.op === "update") {
        queue[index] = {
          op: "append",
          row: pickColumns(op.row),
        };
      } else {
        if (existing?.op === "append" && op.op === "remove") {
          queue.splice(index, 1);
        } else {
          if (existing?.op === "update" && op.op !== "append") {
            queue.splice(
              index,
              1,
              op.op === "remove"
                ? {
                    op: "remove",
                    id: key,
                  }
                : {
                    op: "update",
                    row: pickColumns(op.row),
                  },
            );
          } else {
            queue.push(
              op.op === "remove"
                ? {
                    op: "remove",
                    id: key,
                  }
                : {
                    op: op.op,
                    row: pickColumns(op.row),
                  },
            );
          }
        }
      }
      save(queue);
    },
    flush(store) {
      return (flushing ||= drain(store).finally(() => {
        flushing = null;
      }));
    },
  };
}

function applyOutbox(trades, ops) {
  const byId = new Map(trades.map((trade) => [trade.id, trade]));
  for (const op of ops) {
    if (op.op === "remove") {
      byId.delete(String(op.id));
    } else {
      byId.set(String(op.row.id), {
        ...normalizeTrade(op.row),
        pending: true,
      });
    }
  }
  return [...byId.values()];
}

export function offlineStore(
  remote,
  {
    storage,
    cacheKey = "tj_cache",
    outbox = createOutbox(storage),
    onFlush = () => {},
  },
) {
  const saveCache = (trades) => {
      try {
        storage.setItem(cacheKey, JSON.stringify(trades));
      } catch {}
    },
    readCache = () => {
      try {
        return JSON.parse(storage.getItem(cacheKey)) || [];
      } catch {
        return [];
      }
    },
    sender = {
      append: async (trade) => {
        try {
          return await remote.update(trade);
        } catch (err) {
          if (!/not found/i.test(err.message)) {
            throw err;
          }
          return remote.append(trade);
        }
      },
      update: (trade) => remote.update(trade),
      remove: (id) => remote.remove(id),
    },
    flush = async () => {
      const result = await outbox.flush(sender);
      if (result.sent || result.dropped.length) {
        onFlush(result);
      }
      return result;
    },
    queue = (op, payload) => {
      outbox.add(
        op === "remove"
          ? {
              op,
              id: payload,
            }
          : {
              op,
              row: payload,
            },
      );
      return {
        status: "queued",
      };
    },
    sendOrQueue = (op, payload, send) =>
      op !== "append" && outbox.has(op === "remove" ? payload : payload.id)
        ? Promise.resolve(queue(op, payload))
        : send().catch((err) => {
            if (!isOffline(err) && !needsSignIn(err)) {
              throw err;
            }
            return queue(op, payload);
          }),
    store = {
      ...remote,
      kind: remote.kind,
      outbox,
      stale: false,
      async loadTrades() {
        try {
          if (outbox.size()) {
            await flush();
          }
          const trades = await remote.loadTrades();
          saveCache(trades);
          store.stale = false;
          return applyOutbox(trades, outbox.list());
        } catch (err) {
          if (
            (!isOffline(err) && !needsSignIn(err)) ||
            ((store.stale = true), needsSignIn(err) && !readCache().length)
          ) {
            throw err;
          }
          return applyOutbox(readCache(), outbox.list());
        }
      },
      append: (trade) =>
        sendOrQueue("append", trade, () => remote.append(trade)),
      update: (trade) =>
        sendOrQueue("update", trade, () => remote.update(trade)),
      remove: (id) => sendOrQueue("remove", id, () => remote.remove(id)),
      async appendMany(trades) {
        if (!remote.appendMany) {
          for (const trade of trades) {
            await store.append(trade);
          }
          return {
            status: "ok",
          };
        }
        return remote.appendMany(trades).catch((err) => {
          if (!isOffline(err) && !needsSignIn(err)) {
            throw err;
          }
          trades.forEach((trade) =>
            outbox.add({
              op: "append",
              row: trade,
            }),
          );
          return {
            status: "queued",
          };
        });
      },
      flush,
      forget() {
        outbox.clear();
        storage.removeItem(cacheKey);
      },
    };
  return store;
}
