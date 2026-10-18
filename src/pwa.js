// Install prompt, offline banner and service worker updates.
import { $, toast } from "./ui.js";

let installPrompt = null;

const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true;

function watchOnline(isRemote) {
  const update = () => {
    $("offline-banner").hidden = navigator.onLine || !isRemote();
  };
  addEventListener("online", update);
  addEventListener("offline", update);
  update();
}

function setupInstall() {
  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    $("install-row").hidden = false;
  });
  addEventListener("appinstalled", () => {
    installPrompt = null;
    $("install-row").hidden = true;
    toast("Installed. Open Trade Journal from your home screen or app list.");
  });
  $("install-btn").addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => {});
      installPrompt = null;
      $("install-row").hidden = true;
    }
  });
  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("ios-install").hidden = !isIos || isStandalone();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    addEventListener("load", async () => {
      const reg = await navigator.serviceWorker
        .register("/sw.js")
        .catch(() => null);
      if (!reg) {
        return;
      }
      let reloading = false;
      const offerUpdate = (worker) => {
        $("update-banner").hidden = false;
        $("update-btn").onclick = () => {
          reloading = true;
          worker.postMessage("skip-waiting");
        };
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        offerUpdate(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            offerUpdate(worker);
          }
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) {
          location.reload();
        }
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          reg.update().catch(() => {});
        }
      });
    });
  }
}

export function setupPwa({ remote }) {
  watchOnline(remote);
  setupInstall();
  registerServiceWorker();
}
