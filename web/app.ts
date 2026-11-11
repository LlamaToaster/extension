// LlamaToaster fit check as a plain web page (a static Hugging Face Space).
//
// The same code the Chrome extension runs on huggingface.co model pages: the
// GGUF header is range-read straight from Hugging Face (src/hfHeader.ts), the
// placement is simulated with the app's shared/ code (src/fit.ts) and the
// result is drawn as the same bread marks. A page cannot read the machine the
// way the extension can (chrome.system.*), so RAM and VRAM are typed in; the
// GPU name is detected from WebGL and looked up in the same table.

import { readModelFacts, type ModelFacts } from "../src/hfHeader";
import { evaluateFit, memoryScale, deviceBudget } from "../src/fit";
import { detectGpu, lookupVramMib, looksUnified, memoryPicture, type MemoryPicture } from "../src/hardware";
import { CTX_SLIDER_MAX, DEFAULT_SETTINGS, ctxFromSlider, ctxLabel, sliderFromCtx, ticksHtml, type GpuInfo, type Settings } from "../src/settings";
import { isAuxiliary } from "../src/fileMap";
import { gradeSvg, uncheckedSvg } from "../shared/breadMarks";
import { fitGradeLegendLabel, fitGrades } from "../shared/fitGrade";

type MemType = "auto" | "vram" | "unified" | "cpu";

interface Prefs {
  repo: string;
  ctx: number;
  gpuName: string;
  /** Total VRAM typed in, GB; null = from the GPU table. */
  vramGb: number | null;
  memType: MemType;
  ramGb: number;
  keepVramGb: number;
  keepRamGb: number;
}

const DEFAULT_PREFS: Prefs = { repo: "", ctx: 4096, gpuName: "", vramGb: null, memType: "auto", ramGb: 16, keepVramGb: 1, keepRamGb: 4 };
const STORE_KEY = "lt-web-prefs";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    // storage blocked: defaults
  }
  return { ...DEFAULT_PREFS };
}
function savePrefs() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch {
    // storage blocked: nothing is remembered
  }
}

const prefs = loadPrefs();
let detectedGpu: GpuInfo | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gb = (mib: number) => `${(mib / 1024).toFixed(1)} GB`;

/* ---------- the machine ---------- */

function settings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ctx: prefs.ctx,
    marginMode: "preset",
    marginMib: Math.round(prefs.keepVramGb * 1024),
    ramMarginMode: "preset",
    ramMarginMib: Math.round(prefs.keepRamGb * 1024),
    vramOverrideMib: prefs.vramGb != null ? Math.round(prefs.vramGb * 1024) : null,
    unifiedOverride: prefs.memType === "unified" ? true : prefs.memType === "vram" ? false : null,
    cpuOnly: prefs.memType === "cpu",
  };
}

function gpuInfo(): GpuInfo {
  const name = prefs.gpuName.trim() || null;
  const forced = prefs.memType === "vram" || prefs.memType === "unified";
  return {
    name,
    vendor: name && /apple/i.test(name) ? "Apple" : null,
    architecture: null,
    tableVramMib: lookupVramMib(name),
    unified: looksUnified(name, null),
    noGpu: !forced && (name == null || (name === detectedGpu?.name && detectedGpu.noGpu)),
    detectedAt: Date.now(),
  };
}

function machine(): MemoryPicture {
  const ramMib = prefs.ramGb * 1024;
  return memoryPicture(gpuInfo(), { totalMib: ramMib, availableMib: ramMib }, settings());
}

/* ---------- the model ---------- */

interface QuantRow {
  label: string;
  file: string;
  size: number | null;
  facts?: ModelFacts;
  error?: string;
}

let rows: QuantRow[] = [];
let loadingNote = "";
let abort: AbortController | null = null;

function parseRepo(input: string): string | null {
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:huggingface\.co|hf\.co)\/([\w.-]+\/[\w.-]+)/i.exec(input.trim()) ?? /^([\w.-]+\/[\w.-]+)\s*$/.exec(input.trim());
  return m ? m[1] : null;
}

/** "Qwen3-8B-UD-Q4_K_XL.gguf" -> "UD-Q4_K_XL"; split models in a folder use the folder's name. */
function quantLabel(path: string): string {
  const base = (path.split("/").pop() ?? path).replace(/-\d{5}-of-\d{5}\.gguf$/i, "").replace(/\.gguf$/i, "");
  const m = /(?:^|[-_.])((?:UD-)?(?:I?Q\d(?:_[A-Z0-9]+)*|BF16|F16|F32|MXFP4(?:_MOE)?|NVFP4|TQ\d_\d))$/i.exec(base);
  if (m) return m[1];
  const folder = path.includes("/") ? path.split("/").slice(-2, -1)[0] : "";
  return folder || base;
}

async function listGguf(repo: string, signal: AbortSignal): Promise<QuantRow[]> {
  const res = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`, { signal });
  if (res.status === 401 || res.status === 403) throw new Error("This repository is gated or private. The Chrome extension can read it with your Hugging Face session; a web page can't.");
  if (res.status === 404) throw new Error("Repository not found.");
  if (!res.ok) throw new Error(`Hugging Face API: HTTP ${res.status}`);
  const body = (await res.json()) as { siblings?: { rfilename: string; size?: number }[] };
  const files = (body.siblings ?? []).filter((s) => /\.gguf$/i.test(s.rfilename) && !isAuxiliary(s.rfilename));
  // A split model is one row: shard 1 stands for it, the rest are read with it.
  const sizeOf = new Map<string, number>();
  for (const f of files) {
    const stem = f.rfilename.replace(/-\d{5}-of-\d{5}\.gguf$/i, "");
    sizeOf.set(stem, (sizeOf.get(stem) ?? 0) + (f.size ?? 0));
  }
  const out: QuantRow[] = [];
  for (const f of files) {
    const shard = /-(\d{5})-of-\d{5}\.gguf$/i.exec(f.rfilename);
    if (shard && Number(shard[1]) !== 1) continue;
    const stem = f.rfilename.replace(/-\d{5}-of-\d{5}\.gguf$/i, "");
    out.push({ label: quantLabel(f.rfilename), file: f.rfilename, size: sizeOf.get(stem) || null });
  }
  return out.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
}

async function toast(repo: string) {
  abort?.abort();
  const ctl = new AbortController();
  abort = ctl;
  rows = [];
  loadingNote = "Listing the repository…";
  setError("");
  render();
  try {
    rows = await listGguf(repo, ctl.signal);
    if (rows.length === 0) throw new Error("No GGUF files in this repository.");
    let done = 0;
    loadingNote = `Reading headers: 0 of ${rows.length}`;
    render();
    const queue = [...rows];
    const worker = async () => {
      for (;;) {
        const row = queue.shift();
        if (!row || ctl.signal.aborted) return;
        try {
          row.facts = await readModelFacts(repo, row.file, { signal: ctl.signal });
        } catch (err) {
          if (ctl.signal.aborted) return;
          row.error = err instanceof Error ? err.message : String(err);
        }
        done++;
        loadingNote = done < rows.length ? `Reading headers: ${done} of ${rows.length}` : "";
        render();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  } catch (err) {
    if (ctl.signal.aborted) return;
    rows = [];
    loadingNote = "";
    setError(err instanceof Error ? err.message : String(err));
  }
  render();
}

/* ---------- drawing ---------- */

function setError(msg: string) {
  const el = $("error");
  el.textContent = msg;
  el.hidden = !msg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function render() {
  const s = settings();
  const mem = machine();
  const scale = memoryScale(mem);
  const budget = deviceBudget(mem, s, null);

  // The machine summary under the inputs.
  const parts: string[] = [];
  if (mem.kind === "cpu") parts.push("CPU only");
  else if (mem.vramUnknown) parts.push("VRAM size unknown: type it in");
  else parts.push(`${mem.kind === "unified" ? "Unified memory" : "VRAM"} ${gb(mem.deviceTotalMib)}, keeping ${prefs.keepVramGb} GB free`);
  parts.push(`RAM ${prefs.ramGb} GB, keeping ${prefs.keepRamGb} GB free`);
  $("machineNote").textContent = parts.join(" · ");

  $("ctxValue").textContent = ctxLabel(prefs.ctx);
  const first = rows.find((r) => r.facts)?.facts;
  $("modelNote").textContent = first
    ? `${first.expertCount ? "MoE" : "Dense"} · ${first.nLayer} layers${first.trainedCtx ? ` · max context ${ctxLabel(first.trainedCtx)}` : ""}${first.trainedCtx && prefs.ctx > first.trainedCtx ? " (your context is capped at it)" : ""}`
    : "";
  $("progress").textContent = loadingNote;

  const list = $("quants");
  list.replaceChildren();
  for (const r of rows) {
    const det = el("details", "quant");
    const sum = el("summary");
    const mark = el("span", "mark");
    let headline = "Reading the header…";
    let lines: string[] = [];
    if (r.error) {
      mark.innerHTML = uncheckedSvg(16);
      headline = r.error;
    } else if (r.facts) {
      if (mem.vramUnknown) {
        mark.innerHTML = uncheckedSvg(16);
        headline = "Type the VRAM size to check this";
      } else {
        const a = evaluateFit(r.facts, mem, s, budget);
        mark.innerHTML = a.grade != null ? gradeSvg(a.scale, a.grade, { px: 16, dark: true }) : uncheckedSvg(16);
        headline = a.headline;
        lines = a.details;
      }
    } else {
      mark.innerHTML = uncheckedSvg(16);
    }
    sum.append(mark, el("span", "q", r.label), el("span", "size muted", r.size ? gb(r.size / 1048576) : ""), el("span", "head", headline));
    det.append(sum);
    if (lines.length) {
      const ul = el("ul", "detail muted small");
      for (const l of lines) ul.append(el("li", undefined, l));
      det.append(ul);
    }
    list.append(det);
  }
  $("results").hidden = rows.length === 0;

  $("legend").innerHTML = fitGrades(scale)
    .map((g) => `<span class="mark">${gradeSvg(scale, g, { px: 14, dark: true })}</span><span>${fitGradeLegendLabel(scale, g, "yours")}</span>`)
    .join("");
}

/* ---------- inputs ---------- */

function bindNumber(id: string, key: "ramGb" | "keepVramGb" | "keepRamGb" | "vramGb") {
  const input = $<HTMLInputElement>(id);
  const v = prefs[key];
  input.value = v == null ? "" : String(v);
  input.addEventListener("input", () => {
    const n = input.value.trim() === "" ? null : Number(input.value);
    if (n != null && (!Number.isFinite(n) || n < 0)) return;
    if (key === "vramGb") prefs.vramGb = n;
    else prefs[key] = n ?? 0;
    savePrefs();
    render();
  });
}

function init() {
  const repoInput = $<HTMLInputElement>("repo");
  const fromUrl = new URLSearchParams(location.search).get("repo");
  repoInput.value = fromUrl ?? prefs.repo;

  const submit = () => {
    const repo = parseRepo(repoInput.value);
    if (!repo) {
      setError("Enter a Hugging Face repository: owner/name, or a link to its page.");
      return;
    }
    prefs.repo = repo;
    savePrefs();
    try {
      history.replaceState(null, "", `?repo=${encodeURIComponent(repo)}`);
    } catch {
      // not allowed here: the address just stays as it is
    }
    void toast(repo);
  };
  $("check").addEventListener("click", submit);
  repoInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((b) =>
    b.addEventListener("click", () => {
      repoInput.value = b.dataset.example ?? "";
      submit();
    })
  );

  const gpu = $<HTMLInputElement>("gpu");
  gpu.value = prefs.gpuName;
  gpu.addEventListener("input", () => {
    prefs.gpuName = gpu.value;
    savePrefs();
    render();
  });
  const type = $<HTMLSelectElement>("memType");
  type.value = prefs.memType;
  type.addEventListener("change", () => {
    prefs.memType = type.value as MemType;
    savePrefs();
    render();
  });
  bindNumber("vram", "vramGb");
  bindNumber("ram", "ramGb");
  bindNumber("keepVram", "keepVramGb");
  bindNumber("keepRam", "keepRamGb");

  const slider = $<HTMLInputElement>("ctx");
  slider.max = String(CTX_SLIDER_MAX);
  slider.value = String(sliderFromCtx(prefs.ctx));
  $("ticks").innerHTML = ticksHtml();
  slider.addEventListener("input", () => {
    prefs.ctx = ctxFromSlider(Number(slider.value));
    // The thumb snaps to the labelled stops.
    slider.value = String(sliderFromCtx(prefs.ctx));
    savePrefs();
    render();
  });

  render();
  if (fromUrl && parseRepo(fromUrl)) submit();

  // The GPU name is read from the browser; a typed name wins over it.
  void detectGpu().then((g) => {
    detectedGpu = g;
    $("detected").textContent = g.name ? `Detected by your browser: ${g.name}${g.noGpu ? " (software rendering, not a real GPU)" : ""}` : "Your browser did not report a GPU name: type it in.";
    if (!prefs.gpuName && g.name) {
      prefs.gpuName = g.name;
      gpu.value = g.name;
    }
    render();
  });
}

init();
