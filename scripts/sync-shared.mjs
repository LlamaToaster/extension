// Copies the fit logic this extension uses from the LlamaToaster app repo into
// shared/, so the extension and the web UI give the same answer for the same
// header and memory.
//
//   node scripts/sync-shared.mjs <path to a LlamaToaster/LlamaToaster checkout>
//
// Which files: every shared/*.ts reached by following relative imports from
// src/ (and from those files in turn). Files no longer reached are removed.
// shared/ is never edited here: change it in the app repo, then sync. The
// "Sync shared" workflow runs this daily and opens a PR when anything changed.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstreamArg = process.argv[2];
if (!upstreamArg) {
  console.error("usage: node scripts/sync-shared.mjs <path to LlamaToaster checkout>");
  process.exit(2);
}
const upstream = resolve(upstreamArg);
const upShared = join(upstream, "shared");
if (!existsSync(join(upShared, "fitLevel.ts"))) {
  console.error(`${upShared} does not look like LlamaToaster's shared/ folder`);
  process.exit(2);
}
const outDir = join(here, "shared");

const IMPORT = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

/** shared/<name>.ts files imported by `src` (resolved against `fromDir`). */
function sharedImports(src, fromDir, sharedDir) {
  const found = [];
  for (const m of src.matchAll(IMPORT)) {
    const target = resolve(fromDir, m[1]).replace(/\.js$/, "");
    const rel = relative(sharedDir, target);
    if (rel.startsWith("..") || rel.includes(sep)) continue;
    found.push(rel + ".ts");
  }
  return found;
}

// Roots: the extension's own sources, whose imports point at ./shared.
const queue = [];
for (const f of readdirSync(join(here, "src"))) {
  if (!f.endsWith(".ts")) continue;
  queue.push(...sharedImports(readFileSync(join(here, "src", f), "utf8"), join(here, "src"), outDir));
}
const needed = new Set();
while (queue.length) {
  const name = queue.pop();
  if (needed.has(name)) continue;
  const path = join(upShared, name);
  if (!existsSync(path)) throw new Error(`src/ imports shared/${name}, which LlamaToaster's shared/ does not have`);
  needed.add(name);
  queue.push(...sharedImports(readFileSync(path, "utf8"), upShared, upShared));
}

mkdirSync(outDir, { recursive: true });
let changed = 0;
for (const name of [...needed].sort()) {
  const text = readFileSync(join(upShared, name), "utf8").replace(/\r\n/g, "\n");
  const dest = join(outDir, name);
  if (existsSync(dest) && readFileSync(dest, "utf8") === text) continue;
  writeFileSync(dest, text);
  console.log(`updated shared/${name}`);
  changed++;
}
for (const name of readdirSync(outDir)) {
  if (name.endsWith(".ts") && !needed.has(name)) {
    rmSync(join(outDir, name));
    console.log(`removed shared/${name}`);
    changed++;
  }
}
console.log(changed ? `${changed} file(s) changed` : `shared/ is up to date (${needed.size} files)`);
