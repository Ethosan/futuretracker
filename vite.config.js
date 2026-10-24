import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

// Files from public/ the service worker saves for offline use (screenshots are left out).
const PUBLIC_PRECACHE = ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "icon.svg", "manifest.webmanifest", "privacy.html", "terms.html"];

// Builds dist/sw.js from ./sw.js: puts PRECACHE (every file of this build) and VERSION (a hash
// of those files, so any change installs a new worker) in front of it.
function serviceWorker() {
  return {
    name: "service-worker",
    apply: "build",
    closeBundle() {
      const assets = readdirSync("dist/assets").map((f) => "/assets/" + f).sort();
      const files = [...assets, ...PUBLIC_PRECACHE.map((f) => "/" + f)];
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync("dist" + f));
      const head = `const PRECACHE = ${JSON.stringify(["/", ...files])};\nconst VERSION = "${hash.digest("hex").slice(0, 12)}";\n`;
      writeFileSync("dist/sw.js", head + readFileSync("sw.js", "utf8"));
    },
  };
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorker()],
});
