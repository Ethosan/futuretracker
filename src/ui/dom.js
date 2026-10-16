export const $ = id => document.getElementById(id);

let toastTimer = null;
export function toast(msg, isError = false) {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast" + (isError ? " err" : ""); }, 2600);
}

export function setSyncStatus(state, label) {
  $("sync-dot").className = "sync-dot " + state;
  $("sync-label").textContent = label;
}

export function show(el, on = true) {
  (typeof el === "string" ? $(el) : el).hidden = !on;
}

/* A button whose label swaps to a spinner while a promise runs. */
export async function busy(btn, label, work) {
  const before = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = label + '<span class="spinner" aria-hidden="true"></span>';
  try {
    return await work();
  } finally {
    btn.disabled = false;
    btn.innerHTML = before;
  }
}

/* Single-select or multi-select group of toggle buttons. */
export function pressGroup(container, value, { multi = false } = {}) {
  container.querySelectorAll("button[data-value]").forEach(b => {
    const on = multi ? value.includes(b.dataset.value) : b.dataset.value === value;
    b.setAttribute("aria-pressed", String(on));
  });
}

export const pressedValues = container =>
  [...container.querySelectorAll('button[data-value][aria-pressed="true"]')].map(b => b.dataset.value);

/* Simple accessible modal handling: Escape closes, focus returns. */
export function trapEscape(isOpen, close) {
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && isOpen()) close();
  });
}
