/* Installable app: service worker and updates, offline bar, install button. */
import { $, toast } from "./dom.js";

let installPrompt = null;

export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function offlineBar(remote) {
  const update = () => { $("offline-banner").hidden = navigator.onLine || !remote(); };
  addEventListener("online", update);
  addEventListener("offline", update);
  update();
}

/* Chrome, Edge and Android give an install prompt we can show from a button.
   iPhone and iPad need Share, then Add to Home Screen, so we say that instead. */
function installButton() {
  addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    installPrompt = e;
    $("install-row").hidden = false;
  });
  addEventListener("appinstalled", () => {
    installPrompt = null;
    $("install-row").hidden = true;
    toast("Installed. Open Trade Journal from your home screen or app list.");
  });
  $("install-btn").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    $("install-row").hidden = true;
  });
  const apple = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("ios-install").hidden = !apple || isStandalone();
}

/* A new version installs in the background and waits; the bar's Reload
   button switches to it, so nobody loses a half-typed trade. */
function serviceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  addEventListener("load", async () => {
    const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
    if (!reg) return;
    let switching = false;
    const ready = worker => {
      $("update-banner").hidden = false;
      $("update-btn").onclick = () => { switching = true; worker.postMessage("skip-waiting"); };
    };
    if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) ready(worker);
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (switching) location.reload(); });
    /* Look for a new version whenever the app comes back to the front. */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  });
}

export function initPwa({ remote }) {
  offlineBar(remote);
  installButton();
  serviceWorker();
}
