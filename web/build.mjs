// Builds the web version of the fit check into dist-web/: a static site, and
// with its README.md front matter a ready-to-push Hugging Face Space
// (sdk: static).
//
//   npm run build:web      one build
//   npm run serve:web      build, then serve dist-web/ on http://localhost:8080

import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(root, "dist-web");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "icons"), { recursive: true });
mkdirSync(join(out, "fonts"), { recursive: true });

for (const f of ["index.html", "app.css"]) cpSync(join(here, f), join(out, f));
for (const f of ["icon-32.png", "llama.png"]) cpSync(join(root, "icons", f), join(out, "icons", f));

const fontDir = join(root, "node_modules", "@fontsource");
const fonts = {
  "barlow-400.woff2": "barlow/files/barlow-latin-400-normal.woff2",
  "barlow-500.woff2": "barlow/files/barlow-latin-500-normal.woff2",
  "barlow-600.woff2": "barlow/files/barlow-latin-600-normal.woff2",
  "barlow-condensed-600.woff2": "barlow-condensed/files/barlow-condensed-latin-600-normal.woff2",
  "plex-mono-400.woff2": "ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
};
for (const [name, src] of Object.entries(fonts)) cpSync(join(fontDir, src), join(out, "fonts", name));

await esbuild.build({
  entryPoints: { app: join(here, "app.ts") },
  outdir: out,
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  logLevel: "info",
});

// The Space's own README: Hugging Face reads its front matter.
writeFileSync(
  join(out, "README.md"),
  `---
title: LlamaToaster
emoji: 🍞
colorFrom: yellow
colorTo: red
sdk: static
pinned: false
short_description: Will this local AI model fit your PC? Layers in VRAM and context before you download.
---

The LlamaToaster fit check as a web page: paste a Hugging Face GGUF repository, say what your machine has, and see which quants fit.
The same code as the [Chrome extension](https://github.com/LlamaToaster/extension); everything runs in your browser.
`
);

if (process.argv.includes("--serve")) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".md": "text/markdown" };
  createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "") || "index.html";
    const file = join(out, rel);
    if (!file.startsWith(out) || !existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  }).listen(8080, () => console.log("http://localhost:8080"));
}
