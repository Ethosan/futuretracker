import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/* Builds /sw.js from src/sw.js with the list of files to save offline and a
   version that changes whenever any built file changes. */
function serviceWorker() {
  const publicFiles = dir => readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? publicFiles(p) : ["/" + relative("public", p).split("\\").join("/")];
  });
  return {
    name: "trade-journal-sw",
    apply: "build",
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter(f => !f.endsWith(".map") && f !== "index.html").map(f => "/" + f);
      const files = ["/", ...built, ...publicFiles("public").filter(f => !f.startsWith("/screenshots/"))];
      const hash = createHash("sha256");
      for (const f of Object.values(bundle)) hash.update(f.type === "chunk" ? f.code : f.source);
      /* index.html is written after this hook, so hash its source; public/ files too. */
      hash.update(readFileSync("index.html"));
      for (const f of publicFiles("public")) hash.update(f).update(readFileSync(join("public", f)));
      const version = hash.digest("hex").slice(0, 12);
      const source = `const PRECACHE = ${JSON.stringify(files)};\nconst VERSION = "${version}";\n` + readFileSync("src/sw.js", "utf8");
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({ plugins: [serviceWorker()] });
