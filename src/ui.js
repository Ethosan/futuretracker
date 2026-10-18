// Small UI helpers: toast, sync status, button spinners and toggle-button groups.
export const $ = (id) => document.getElementById(id);

let toastTimer = null;

export function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show" + (isError ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      el.className = "toast" + (isError ? " err" : "");
    },
    isError ? 6000 : 2600,
  );
}

export function setSync(status, label) {
  $("sync-dot").className = "sync-dot " + status;
  $("sync-label").textContent = label;
}

export async function withSpinner(button, label, work) {
  const html = button.innerHTML;
  button.disabled = true;
  button.innerHTML = label + '<span class="spinner" aria-hidden="true"></span>';
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.innerHTML = html;
  }
}

export function setPressed(group, value, { multi = false } = {}) {
  group.querySelectorAll("button[data-value]").forEach((btn) => {
    const on = multi
      ? value.includes(btn.dataset.value)
      : btn.dataset.value === value;
    btn.setAttribute("aria-pressed", String(on));
  });
}

export const pressedValues = (group) =>
  [...group.querySelectorAll('button[data-value][aria-pressed="true"]')].map(
    (btn) => btn.dataset.value,
  );
