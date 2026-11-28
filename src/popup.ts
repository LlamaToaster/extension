import { deviceBudget, deviceInUseMib } from "./fit";
import { escapeHtml, setHtml } from "./trustedHtml";
import { primaryGpu, ramLabel, readHelper, type HelperApp, type HelperGpu, type HelperRam, type HelperResult } from "./helper";
import { detectGpu, memoryPicture, readCpu, readRam, type MemoryPicture, type RamReading } from "./hardware";
import { WHATIF_STOPS_GB } from "./settings";
import { CTX_SLIDER_MAX, ctxFromSlider, ctxLabel, getGpu, getSettings, setSettings, sliderFromCtx, ticksHtml, type GpuInfo, type MarginMode, type Settings } from "./settings";
import { gradeSvg } from "../shared/breadMarks";
import { fitGradeLegendLabel, fitGrades } from "../shared/fitGrade";
import { memoryScale } from "./fit";
import { THEME_KEY, applyTheme, readTheme, saveTheme, type Theme } from "./theme";
import { browserFor, flagsPageUrl } from "./flags";
import { getVramStore, rememberVram, savedVram, setManualVram, type VramSource } from "./vramMemory";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const gb = (mib: number, digits = 1) => `${(mib / 1024).toFixed(digits)} GB`;
/** "8 GB", "7.5 GB": whole sizes without a trailing ".0". */
const size = (mib: number) => `${+(mib / 1024).toFixed(1)} GB`;
const WORKERS_URL = "https://llamatoaster.com/workers";

/** This page is the side panel (panel.html), not the toolbar popup. */
const inPanel = document.body.classList.contains("panel");

let settings: Settings;
let gpu: GpuInfo | null;
let helperRes: HelperResult | null = null;
let helper: HelperGpu | null = null;
/** RAM type and speed: read once from the helper and kept, it doesn't change. */
let ramInfo: HelperRam | null = null;
/** The user clicked "edit" next to the GPU size. */
let windowId: number | undefined;

/** Apps shown on a bar: RAM from 1 GB, VRAM from 512 MB (smaller ones stay in the grey "in use"). */
const APP_MIN_MIB = { ram: 1024, vram: 512 } as const;
/** Barely-there tints so neighbouring apps tell apart; cycled in order of size. */
const APP_TINTS = 4;

/** Light grey = free (the bar itself), yellow from the left = LlamaToaster's
 * llama.cpp, dark grey at the right = everything else in use. The biggest
 * apps (from the worker's helper) are their own faintly tinted segments at
 * the right end, named on hover. */
function setBar(id: string, llama: number, other: number, total: number, apps: HelperApp[] = []) {
  const pct = (v: number) => (total > 0 ? Math.max(0, Math.min(100, (v / total) * 100)) : 0);
  const l = pct(llama);
  const o = Math.min(pct(other), 100 - l);
  const [li, oi] = $(id).children as unknown as HTMLElement[];
  li.style.width = `${l}%`;
  oi.style.width = `${o}%`;
  // Apps can't add up to more than "in use" (the readings are a moment apart).
  const sum = apps.reduce((a, x) => a + x.mib, 0);
  const scale = sum > other && sum > 0 ? other / sum : 1;
  oi.replaceChildren(
    ...apps.map((a, i) => {
      const seg = document.createElement("b");
      seg.className = `app t${i % APP_TINTS}`;
      seg.style.flexBasis = `${other > 0 ? ((a.mib * scale) / other) * 100 : 0}%`;
      seg.title = `${a.name} · ${gb(a.mib)}`;
      return seg;
    })
  );
  oi.title = `in use ${gb(other)}${apps.length ? ` · of which ${apps.map((a) => `${a.name} ${gb(a.mib)}`).join(", ")}` : ""}`;
  $(id).title = `${llama > 0 ? `LlamaToaster ${gb(llama)} · ` : ""}in use ${gb(other)} · free ${gb(Math.max(0, total - llama - other))}`;
}

/** The helper's app list for a bar: above the bar's threshold, LlamaToaster's own llama.cpp left out (it has the yellow segment). */
function barApps(list: HelperApp[] | null | undefined, min: number): HelperApp[] {
  return (list ?? []).filter((a) => a.mib >= min && !/^llama-/i.test(a.name));
}

/** The VRAM size shown next to the GPU name: measured by the worker, or typed by the user. */
function vramSize(mem: MemoryPicture): number | null {
  if (mem.kind !== "vram" || mem.vramUnknown) return null;
  return mem.deviceTotalMib;
}

/** The GPU's name for the store of remembered sizes: the browser's, else the worker's. */
function cardName(): string | null {
  return gpu?.name ?? helper?.name ?? null;
}

/** How a remembered size is named in the pill and in the note. */
const SAVED_PILL: Record<VramSource, string> = {
  worker: "remembered · worker",
  browser: "remembered · browser",
  hf: "from Hugging Face",
  manual: "set manually",
};
const SAVED_NOTE: Record<VramSource, string> = {
  worker: "remembered from the worker's measurement",
  browser: "remembered from the browser's reading",
  hf: "from your Hugging Face profile",
  manual: "set manually",
};

/** Remembers the sizes a live reading gave, so they stay when that source is gone. */
async function rememberLive(mem: MemoryPicture) {
  if (mem.kind !== "vram") return;
  if (helper && mem.measured) await rememberVram(cardName(), "worker", mem.deviceTotalMib);
  if (gpu?.vramMib != null) await rememberVram(cardName(), "browser", gpu.vramMib);
}

/** The bread marks this machine can show, best first, drawn for the theme on screen. */
let lastLegendMem: MemoryPicture | null = null;
function renderLegend(mem: MemoryPicture) {
  lastLegendMem = mem;
  const scale = memoryScale(mem);
  const dark = readTheme() === "dark";
  // Built from constants in shared/breadMarks.ts and shared/fitGrade.ts.
  setHtml($("fitLegend"), fitGrades(scale)
    .map((g) => `<span class="mark">${gradeSvg(scale, g, { px: 14, dark })}</span><span>${fitGradeLegendLabel(scale, g, "yours")}</span>`)
    .join(""));
}

/** Fills a value cell: plain strings are dimmed hardware names, [text] is a bold memory amount. */
function parts(id: string, ...bits: (string | [string])[]) {
  $(id).replaceChildren(
    ...bits.map((b) => {
      const el = document.createElement(Array.isArray(b) ? "b" : "span");
      el.className = Array.isArray(b) ? "amt" : "hw";
      el.textContent = Array.isArray(b) ? b[0] : b;
      return el;
    }),
  );
}

/** Why the worker's reading is missing, in words the user can act on, with the action as a link (HTML; "" when it worked). */
function helperReason(r: HelperResult | null): string {
  if (r?.ok) return "";
  const link = (text: string) => `<a href="${WORKERS_URL}" target="_blank" rel="noopener">${text}</a>`;
  // Chrome refuses a host that doesn't list this extension's ID: the worker was registered before that ID was added.
  if (r && /forbidden|not allowed/i.test(r.error)) return `The LlamaToaster worker on this machine hasn't registered this extension yet: ${link("update the worker")}.`;
  if (!r || r.missing) return `No LlamaToaster worker is registered for this browser on this machine: ${link("install or update the worker")}.`;
  return `Worker helper error: ${escapeHtml(r.error)}. ${link("Update the worker")}.`;
}

async function renderMemory() {
  const ram = await readRam();
  // "This machine" always shows the real one; the what-if box shows the imagined one.
  const saved = savedVram(await getVramStore(), cardName());
  const mem = memoryPicture(gpu, ram, { ...settings, whatIf: false }, helper, saved);
  void rememberLive(mem);
  const llamaRam = ram ? Math.min(helperRes?.ok ? helperRes.reading.llamaRamMib : 0, ram.totalMib - ram.availableMib) : 0;
  renderWhatIf(mem, ram, llamaRam);

  const type = ramLabel(ramInfo);
  if (ram) parts("ram", [gb(ram.availableMib)], " free of ", [size(ram.totalMib)], ...(type ? [` · ${type}`] : []));
  else parts("ram", "unknown");
  $("ram").title = ramInfo ? `${ramInfo.modules} module${ramInfo.modules === 1 ? "" : "s"}${ramInfo.ratedMts ? `, rated ${ramInfo.ratedMts} MT/s` : ""}` : "RAM type and speed come from a LlamaToaster worker on this machine";
  if (ram) setBar("ramBar", llamaRam, ram.totalMib - ram.availableMib - llamaRam, ram.totalMib, barApps(helperRes?.ok ? helperRes.reading.topRam : null, APP_MIN_MIB.ram));

  // GPU: name · VRAM size (or the memory kind when there is no own VRAM).
  // Without the helper, a software renderer means Chrome lost its GPU: say how to get it back.
  const chromeNoGpu = !helper && !!gpu?.softwareRenderer;
  const name = helper?.name ?? (chromeNoGpu ? "none found · restart Chrome" : gpu?.noGpu ? "none found" : gpu?.name ?? "unknown");
  $("gpu").title = chromeNoGpu ? "Chrome is drawing without its GPU. Restart Chrome; if it stays this way, update the GPU driver. Installing the LlamaToaster worker reads the card directly." : "";
  const vram = vramSize(mem);
  if (mem.kind === "vram" && vram != null) parts("gpu", `${name} · ${size(vram)}`);
  else parts("gpu", mem.kind === "cpu" ? name : mem.kind === "unified" ? `${name} · shared RAM` : name);

  // The size input shows only when it's needed: unknown card or a size set manually.
  const totalInput = $<HTMLInputElement>("vramTotal");
  const typing = mem.kind === "vram" && (mem.vramUnknown || saved?.source === "manual");
  $("vramInput").hidden = !typing;
  $("vramAvail").hidden = typing;
  $("vramSrc").hidden = false;
  if (document.activeElement !== totalInput) totalInput.value = vram != null ? String(+(vram / 1024).toFixed(1)) : "";
  const src = $("vramSrc");
  src.textContent = mem.measured
    ? "measured"
    : mem.totalFromBrowser
      ? "read by the browser"
      : mem.totalFromSaved
        ? SAVED_PILL[mem.totalFromSaved]
        : "enter";
  src.className = `pill${mem.vramUnknown ? " warn" : mem.measured || mem.totalFromBrowser ? " ok" : ""}`;

  renderLegend(mem);

  // "Auto" says what it found.
  const auto = memoryPicture(gpu, ram, { ...settings, whatIf: false, cpuOnly: false, unifiedOverride: null }, helper, saved).kind;
  $("kindAuto").textContent = `Auto · ${auto === "vram" ? "Dedicated VRAM" : auto === "unified" ? "Unified (shared RAM)" : "CPU only"}`;
  $<HTMLSelectElement>("kind").value = settings.cpuOnly ? "cpu" : settings.unifiedOverride == null ? "auto" : settings.unifiedOverride ? "unified" : "vram";


  $("availLabel").textContent = mem.kind === "unified" ? "GPU can use" : mem.kind === "cpu" ? "Model memory" : "VRAM";
  // CPU only: no GPU memory to describe, so the row goes (RAM has its own above).
  $("vramRow").hidden = mem.kind === "cpu";
  if (mem.kind === "cpu") parts("vramAvail", "");
  else if (mem.vramUnknown) parts("vramAvail", "");
  // Without a reading of what other apps hold, "free" would only repeat the total: show the size alone.
  else if (mem.kind === "vram" && !mem.measured) parts("vramAvail", [size(mem.deviceTotalMib)]);
  else parts("vramAvail", [gb(mem.deviceFreeMib)], " free of ", [size(mem.deviceTotalMib)]);
  // VRAM: free vs in use. LlamaToaster's own llama.cpp counts as in use here.
  // With no size known the bar stays empty (all free) and has no lever (renderKeep hides it without a model).
  if (mem.vramUnknown) setBar("vramBar", 0, 0, 1, []);
  else setBar("vramBar", 0, deviceInUseMib(mem), mem.deviceTotalMib, mem.measured ? barApps(helper?.apps, APP_MIN_MIB.vram) : []);
  $("vramBar").style.display = mem.kind === "cpu" ? "none" : "";
  $("legendLlama").style.display = llamaRam > 0 ? "" : "none";

  // The size field's tooltip already says how to get the size: only the worker is offered, folded away
  // on the legend row. Shown while nothing measures free VRAM.
  const workerUp = mem.measured || !!helperRes?.ok;
  const offerWorker = mem.kind === "vram" && !workerUp;
  $("workerHead").hidden = !offerWorker;
  $("workerBody").hidden = !offerWorker || $("workerHead").getAttribute("aria-expanded") !== "true";
  if (offerWorker) {
    setHtml($("workerBody"), helperReason(helperRes));
  }

  const note = $("memNote");
  note.className = "note";
  if (workerUp) {
    // The worker may take a moment to answer: the offer above disappears and this line takes its place.
    note.textContent = "LlamaToaster worker is installed: memory is read automatically.";
  } else if (mem.kind === "unified") {
    note.textContent = /apple/i.test(`${gpu?.vendor} ${gpu?.name}`) ? "Apple silicon: the GPU can use roughly 70-80% of RAM. This is an estimate (Apple publishes no formula); with the LlamaToaster worker it is read from the Mac." : "The GPU shares system RAM.";
  } else note.textContent = "";

  keepModels.ram = ram
    ? { total: ram.totalMib, base: ram.totalMib, inUse: ram.totalMib - ram.availableMib, mode: settings.ramMarginMode, fixed: settings.ramMarginMib, estimate: false }
    : null;
  keepModels.vram =
    mem.kind === "cpu" || mem.deviceTotalMib <= 0
      ? null
      : {
          total: mem.deviceTotalMib,
          base: deviceBudget(mem, { ...settings, marginMode: "preset" }, null).freeMib,
          inUse: deviceInUseMib(mem),
          mode: settings.marginMode,
          fixed: settings.marginMib,
          estimate: !mem.measured && mem.kind === "vram",
        };
  if (keepDragging !== "ram") renderKeep("ram");
  if (keepDragging !== "vram") renderKeep("vram");
}

// ------------------------------------------------------------ what if
//
// Imagined RAM/VRAM: the whole range shows at once, on fixed log-ish stops
// (WHATIF_STOPS_GB) plus a stop at this machine's own size.

let whatIfOwn = { ram: 0, vram: 0 };
const whatIfStopList: Record<"ram" | "vram", number[]> = { ram: [], vram: [] };
/** The left half: every smaller step up to (and ending with) this machine's own size; empty when there is none. */
const whatIfLowList: Record<"ram" | "vram", number[]> = { ram: [], vram: [] };
const big = size;

/** The right half's stops: this machine's own size first, then every larger step. */
function whatIfRight(scale: "ram" | "vram" | "unified", own: number): number[] {
  const larger = WHATIF_STOPS_GB[scale].map((g) => g * 1024).filter((s) => s > own + 256);
  if (own > 0) return [own, ...larger];
  // Nothing known for this card: the slider starts at 1 GB, with 1 and 2 GB before the usual steps.
  return scale === "vram" ? [1024, 2048, ...larger] : larger;
}
/** The left half's stops: every smaller step, then this machine's own size. */
function whatIfLeft(scale: "ram" | "vram" | "unified", own: number): number[] {
  const smaller = WHATIF_STOPS_GB[scale].map((g) => g * 1024).filter((s) => s < own - 256);
  return own > 0 && smaller.length ? [...smaller, own] : [];
}
/** A value's place between the stops as a continuous index (log-interpolated). */
function whatIfPos(stops: number[], v: number): number {
  const n = stops.length;
  if (n < 2 || v <= stops[0]) return 0;
  if (v >= stops[n - 1]) return n - 1;
  let i = 0;
  while (stops[i + 1] <= v) i++;
  return i + Math.log(v / stops[i]) / Math.log(stops[i + 1] / stops[i]);
}
/** The value at a continuous index, in sensible round steps; the stops themselves stay exact. */
function whatIfAt(stops: number[], t: number): number {
  const i = Math.min(stops.length - 2, Math.max(0, Math.floor(t)));
  if (stops.length < 2) return stops[0] ?? 0;
  const v = stops[i] * Math.pow(stops[i + 1] / stops[i], t - i);
  const step = v < 16384 ? 512 : v < 131072 ? 1024 : 8192;
  return Math.min(stops[stops.length - 1], Math.max(stops[0], Math.round(v / step) * step));
}
const WHATIF_PULL_PX = 4;
/** Where stop i sits along the bar: the right half, 50%..100%; with no size of this machine's own, the whole bar. */
const whatIfPct = (i: number, n: number, own: number) => (own > 0 ? 50 : 0) + (n > 1 ? (i / (n - 1)) * (own > 0 ? 50 : 100) : 0);
/** Where a value sits along the whole bar, 0..100%: up to this machine's own size the bar is
 * linear (the memory you have, 0..50%); above it the larger stops follow on a log scale. */
function whatIfPlace(own: number, up: number[], v: number): number {
  if (own > 0 && v < own) return Math.max(0, v / own) * 50;
  return whatIfPct(whatIfPos(up, v), up.length, own);
}
/** Left half, as the keep-free lever moves: 0.1 GB steps, a slight pull onto every whole GB and the own size. */
const WHATIF_MIN_MIB = 1024;
function whatIfLinear(own: number, px: number, width: number): number {
  const pull = Math.min(WHATIF_PULL_PX, (0.2 * width * 1024) / Math.max(own, 1)); // at most a fifth of the gap between whole GBs
  const toX = (v: number) => (v / own) * width;
  let best: number | null = null;
  let bd = pull;
  const stops = [own];
  for (let g = 1024; g < own; g += 1024) stops.push(g);
  for (const s of stops) {
    const d = Math.abs(toX(s) - px);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  if (best != null) return best;
  const raw = (px / width) * own;
  return Math.max(Math.min(WHATIF_MIN_MIB, own), Math.min(own, Math.round(raw / KEEP_STEP) * KEEP_STEP));
}

function whatIfValue(id: "ram" | "vram"): number {
  const v = id === "ram" ? settings.whatIfRamMib : settings.whatIfVramMib;
  return v ?? whatIfOwn[id];
}

function renderWhatIf(real: MemoryPicture, ram: RamReading | null, llamaRam: number) {
  const unified = real.kind === "unified";
  const ownVram = real.kind === "vram" && !real.vramUnknown ? real.deviceTotalMib : 0;
  whatIfOwn = { ram: real.ramTotalMib ?? 0, vram: ownVram };
  whatIfStopList.ram = whatIfRight(unified ? "unified" : "ram", whatIfOwn.ram);
  whatIfStopList.vram = whatIfRight("vram", whatIfOwn.vram);
  whatIfLowList.ram = whatIfLeft(unified ? "unified" : "ram", whatIfOwn.ram);
  whatIfLowList.vram = whatIfLeft("vram", whatIfOwn.vram);
  $<HTMLInputElement>("whatIfOn").checked = settings.whatIf;
  $("memory").classList.toggle("whatif", settings.whatIf);
  $("memTitle").textContent = settings.whatIf ? "What if" : "This machine";
  const whatIfTip = $("whatIfOn").parentElement!.getAttribute("data-tip") ?? "";
  if (settings.whatIf) $("memTitle").setAttribute("data-tip", whatIfTip);
  else $("memTitle").removeAttribute("data-tip");
  $("whatIfVramRow").style.display = unified ? "none" : "";
  $("whatIfRamLabel").textContent = unified ? "Unified memory" : "RAM";

  // Left half: this machine as the common bars draw it (free / in use).
  if (ram) setBar("whatIfReal_ram", llamaRam, ram.totalMib - ram.availableMib - llamaRam, ram.totalMib, barApps(helperRes?.ok ? helperRes.reading.topRam : null, APP_MIN_MIB.ram));
  setBar("whatIfReal_vram", 0, deviceInUseMib(real), whatIfOwn.vram, real.measured ? barApps(helper?.apps, APP_MIN_MIB.vram) : []);
  $("whatIfReal_ram").classList.toggle("empty", whatIfOwn.ram <= 0);
  $("whatIfReal_vram").classList.toggle("empty", whatIfOwn.vram <= 0);

  // Right half: the possible sizes, brighter up to the lever.
  for (const id of ["ram", "vram"] as const) {
    const stops = whatIfStopList[id];
    const value = whatIfValue(id);
    const low = whatIfLowList[id];
    const pct = whatIfPlace(whatIfOwn[id], stops, value);
    const lowNotches = low.slice(0, -1).map((_, i) => `<i style="left:${((low[i] / whatIfOwn[id]) * 50).toFixed(3)}%"></i>`);
    setHtml($(`whatIfNotches_${id}`), lowNotches
      .concat(stops.map((_, i) => `<i${i === 0 && whatIfOwn[id] > 0 ? ' class="own"' : ""} style="left:${whatIfPct(i, stops.length, whatIfOwn[id]).toFixed(3)}%"></i>`))
      .join(""));
    $(`whatIf_${id}`).querySelector<HTMLElement>(".lever")!.style.left = `${pct}%`;
    const own = whatIfOwn[id];
    const track = $(`whatIf_${id}`);
    const lowest = own > 0 ? Math.min(WHATIF_MIN_MIB, own) : stops[0] ?? 0;
    track.setAttribute("aria-valuemin", String(+(lowest / 1024).toFixed(1)));
    track.setAttribute("aria-valuemax", String(+((stops[stops.length - 1] ?? own) / 1024).toFixed(1)));
    track.setAttribute("aria-valuenow", String(+(value / 1024).toFixed(1)));
    track.setAttribute("aria-valuetext", big(value));
    track.setAttribute("aria-disabled", String(!stops.length));
    const x = own > 0 ? value / own : 0;
    if (own > 0) parts(`whatIfVal_${id}`, [big(value)], ` · ${x >= 10 ? x.toFixed(0) : x < 0.1 ? +x.toFixed(2) : +x.toFixed(1)}× yours`);
    else if (stops.length && value > 0) parts(`whatIfVal_${id}`, [big(value)]);
    else parts(`whatIfVal_${id}`, "none");
    $(`whatIf_${id}`).title = `Imagined ${id === "ram" ? "RAM" : "VRAM"} size`;
  }
  const note = unified ? "The GPU share follows the unified memory size. " : "";
  $("whatIfNote").textContent = `${note}Marks on open pages are checked against this imagined machine, with all of it free.`;
}

function wireWhatIf() {
  $<HTMLInputElement>("whatIfOn").addEventListener("change", (e) => void save({ whatIf: (e.target as HTMLInputElement).checked }, true));
  for (const id of ["ram", "vram"] as const) {
    const track = $(`whatIf_${id}`);
    const key = id === "ram" ? "whatIfRamMib" : "whatIfVramMib";
    const pick = (clientX: number, now: boolean) => {
      const stops = whatIfStopList[id];
      if (!stops.length) return;
      const r = track.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(r.width, 1)));
      // Left of the middle: smaller sizes; right of it: larger ones. Smooth, with a pull
      // onto the nearest notch when the lever is within a few pixels of it.
      const own = whatIfOwn[id];
      let value: number;
      if (f < 0.5 && own > 0) {
        value = whatIfLinear(own, f * r.width, r.width / 2);
      } else {
        // With a size of its own the stops fill the right half; without one they fill the whole bar.
        const t = own > 0 ? (f <= 0.5 ? 0 : (f - 0.5) * 2 * (stops.length - 1)) : f * (stops.length - 1);
        const pxPerStop = (own > 0 ? r.width / 2 : r.width) / Math.max(1, stops.length - 1);
        const near = Math.round(t);
        value = Math.abs(t - near) * pxPerStop <= WHATIF_PULL_PX ? stops[near] : whatIfAt(stops, t);
      }
      void save({ [key]: value } as Partial<Settings>, now);
    };
    let dragging = false;
    track.addEventListener("pointerdown", (e) => {
      dragging = true;
      track.classList.add("drag");
      track.setPointerCapture(e.pointerId);
      pick(e.clientX, false);
    });
    track.addEventListener("pointermove", (e) => { if (dragging) pick(e.clientX, false); });
    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove("drag");
      pick(e.clientX, true);
    };
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
    track.addEventListener("keydown", (e) => {
      const stops = whatIfStopList[id];
      if (!stops.length) return;
      // Home / End: the smallest and the largest size, as on a native slider.
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const own = whatIfOwn[id];
        const next = e.key === "End" ? stops[stops.length - 1] : own > 0 ? Math.min(WHATIF_MIN_MIB, own) : stops[0];
        void save({ [key]: next } as Partial<Settings>, true);
        return;
      }
      const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      // Up to the own size: 0.1 GB (Shift: 1 GB) like the keep-free lever. Above it, notch to notch.
      const cur = whatIfValue(id);
      const own = whatIfOwn[id];
      let next: number;
      if (own > 0 && (cur < own - 1 || (d < 0 && cur <= own + 1))) {
        const step = e.shiftKey ? 1024 : KEEP_STEP;
        next = Math.max(Math.min(WHATIF_MIN_MIB, own), Math.min(own, Math.round((cur + d * step) / KEEP_STEP) * KEEP_STEP));
        if (d > 0 && cur + step >= own) next = own;
      } else {
        next = d > 0 ? stops.find((s) => s > cur + 1) ?? stops[stops.length - 1] : stops.findLast((s) => s < cur - 1) ?? stops[0];
      }
      void save({ [key]: next } as Partial<Settings>, true);
    });
  }
}

// ------------------------------------------------------------ keep free
//
// A lever under each memory bar. Where it stands is where the model's share
// ends: any amount from 0 up to everything the fit could use, in 0.1 GB steps,
// with a slight pull onto the presets, "in use now" and every whole GB.
// "In use now" follows usage live here; a check freezes it when it starts.

type KeepId = "ram" | "vram";
interface KeepModel {
  /** The bar's whole size. */
  total: number;
  /** What the fit may fill before anything is kept free: the total, or what is available. */
  base: number;
  /** In use right now: the "in use now" stop. */
  inUse: number;
  mode: MarginMode;
  /** The fixed amount (mode "preset"). */
  fixed: number;
  /** Live in-use is the user's estimate (no worker reading). */
  estimate: boolean;
}
const keepModels: Record<KeepId, KeepModel | null> = { ram: null, vram: null };
const KEEP_PRESETS: Record<KeepId, number[]> = { ram: [0, 2048, 4096, 6144, 8192], vram: [0, 512, 1024, 1536, 2048] };
const KEEP_STEP = 1024 / 10;
const KEEP_PULL_PX = 4;
let keepDragging: KeepId | null = null;

const keepAmount = (m: KeepModel) => (m.mode === "current" ? m.inUse : m.fixed);
/** Where a stop puts the lever, 0..1 along the bar: "in use now" sits where in-use starts, a fixed amount that far below the base. */
const stopX = (m: KeepModel, stop: number | "current") =>
  m.total > 0 ? Math.max(0, Math.min(1, (stop === "current" ? m.total - m.inUse : m.base - stop) / m.total)) : 0;

function renderKeep(id: KeepId) {
  const m = keepModels[id];
  const track = $(`${id}Keep`);
  const bar = $(`${id}Bar`);
  track.style.display = m && bar.style.display !== "none" ? "" : "none";
  const [, , keepOff, edgeOff] = bar.children as unknown as HTMLElement[];
  // No model (size unknown): the bar is just empty, with no kept-free part or edge left over.
  keepOff.style.width = m ? keepOff.style.width : "0";
  edgeOff.style.display = m ? "" : "none";
  if (!m) return;
  const keep = keepAmount(m);
  const x = stopX(m, m.mode === "current" ? "current" : m.fixed);
  const [, , keepEl, edge] = bar.children as unknown as HTMLElement[];
  keepEl.style.width = `${(1 - x) * 100}%`;
  edge.style.left = `${x * 100}%`;
  const lever = track.querySelector<HTMLElement>(".lever")!;
  const val = track.querySelector<HTMLElement>(".val")!;
  lever.style.left = val.style.left = `${x * 100}%`;
  val.textContent = m.mode === "current" ? m.estimate ? gb(keep) : `in use · ${gb(keep)}` : gb(keep);
  // Left of the lever when it fits there without touching the label; otherwise right of it, and never over the label.
  const lblEnd = track.querySelector<HTMLElement>(".lbl")!.offsetWidth + 8;
  const leverPx = x * track.clientWidth;
  if (leverPx - 8 - val.offsetWidth >= lblEnd) val.style.transform = "translateX(calc(-100% - 8px))";
  else val.style.transform = `translateX(${Math.max(8, lblEnd - leverPx)}px)`;
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(+(m.base / 1024).toFixed(1)));
  track.setAttribute("aria-valuenow", String(+(keep / 1024).toFixed(1)));
  track.setAttribute("aria-valuetext", val.textContent);
  track.title =
    m.mode === "current"
      ? "Keeps free what other apps use when a check starts on a page, so the marks don't move as usage changes afterwards."
      : `The model may use ${gb(Math.max(0, m.base - keep))}${m.base < m.total ? " of what is available" : ""}.`;
}

function keepPatch(id: KeepId, choice: number | "current"): Partial<Settings> {
  if (id === "ram") return choice === "current" ? { ramMarginMode: "current" } : { ramMarginMode: "preset", ramMarginMib: choice };
  return choice === "current" ? { marginMode: "current" } : { marginMode: "preset", marginMib: choice };
}

/** The pointer's x on the track to a choice: a stop when within a slight pull of it, else a free amount. */
function keepChoiceAt(id: KeepId, m: KeepModel, px: number, width: number): number | "current" {
  const pull = Math.min(KEEP_PULL_PX, (0.2 * width * 1024) / Math.max(m.total, 1)); // at most a fifth of the gap between whole GBs
  const stops: (number | "current")[] = ["current", ...KEEP_PRESETS[id]];
  for (let g = 1024; g < m.base; g += 1024) stops.push(g);
  let best: number | "current" | null = null;
  let bd = pull;
  for (const s of stops) {
    if (s !== "current" && s > m.base) continue;
    const d = Math.abs(stopX(m, s) * width - px);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  if (best != null) return best;
  const raw = m.base - (px / width) * m.total;
  return Math.max(0, Math.min(m.base, Math.round(Math.round(raw / KEEP_STEP) * KEEP_STEP)));
}

function setKeep(id: KeepId, choice: number | "current", now: boolean) {
  const m = keepModels[id];
  if (!m) return;
  if (choice === "current") m.mode = "current";
  else {
    m.mode = "preset";
    m.fixed = choice;
  }
  renderKeep(id);
  void save(keepPatch(id, choice), now);
}

function wireKeep(id: KeepId) {
  const track = $(`${id}Keep`);
  const at = (ev: PointerEvent) => {
    const m = keepModels[id];
    if (!m) return;
    const r = track.getBoundingClientRect();
    setKeep(id, keepChoiceAt(id, m, Math.max(0, Math.min(r.width, ev.clientX - r.left)), r.width), false);
  };
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    track.setPointerCapture(e.pointerId);
    track.classList.add("drag");
    keepDragging = id;
    at(e);
  });
  track.addEventListener("pointermove", (e) => {
    if (keepDragging === id) at(e);
  });
  const end = () => {
    if (keepDragging !== id) return;
    keepDragging = null;
    track.classList.remove("drag");
    void save({}, true);
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  // Arrows: 0.1 GB (Shift: 1 GB). Right gives the model more, as dragging right does.
  track.addEventListener("keydown", (e) => {
    const m = keepModels[id];
    if (!m) return;
    const step = e.shiftKey ? 1024 : KEEP_STEP;
    const cur = keepAmount(m);
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur + step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur - step;
    else if (e.key === "Home") next = m.base;
    else if (e.key === "End") next = 0;
    if (next == null) return;
    e.preventDefault();
    setKeep(id, Math.max(0, Math.min(m.base, Math.round(Math.round(next / KEEP_STEP) * KEEP_STEP))), true);
  });
}

let sliderDragging = false;

const MODE_NOTES: Record<Settings["mode"], string> = {
  off: "Hugging Face pages are left untouched",
  manual: "Check by clicking the toaster",
  auto: "Every GGUF page is checked as it opens",
};
/** Clicking the knob turns it one stop: Off → Manual → Auto → Off. */
const NEXT_MODE: Record<Settings["mode"], Settings["mode"]> = { off: "manual", manual: "auto", auto: "off" };

function renderFit() {
  const lever = $("lever");
  lever.dataset.mode = settings.mode;
  for (const el of lever.querySelectorAll<HTMLElement>(".toggle-label")) el.setAttribute("aria-checked", String(el.dataset.mode === settings.mode));
  $("fit").classList.toggle("is-off", settings.mode === "off");
  $("modeNote").textContent = MODE_NOTES[settings.mode];

  const slider = $<HTMLInputElement>("ctx");
  slider.max = String(CTX_SLIDER_MAX);
  // Not activeElement: the slider keeps focus after a drag, which froze it against changes from the page.
  if (!sliderDragging) slider.value = String(sliderFromCtx(settings.ctx));
  setFill(slider);
  $("ctxVal").textContent = `${ctxLabel(settings.ctx)} tokens`;
  $<HTMLInputElement>("moreDetails").checked = settings.moreDetails;
}

/** How far along the slot the heating element glows (to the handle's centre). */
function setFill(slider: HTMLInputElement) {
  slider.style.setProperty("--frac", String(Number(slider.value) / Number(slider.max || CTX_SLIDER_MAX)));
}

function renderDock() {
  const b = $("dock");
  b.textContent = inPanel ? "Hide sidebar" : "Side panel";
  b.title = inPanel ? "Close the side panel; the toolbar button opens LlamaToaster as a popup again" : "Open in Chrome's side panel: it stays open next to the page instead of covering it";
}

// The theme button flips night <-> day; its icon shows the theme it switches to.
const THEME_ICONS: Record<Theme, string> = {
  light: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13.6 10.4A6 6 0 0 1 5.6 2.4a6 6 0 1 0 8 8z" fill="currentColor"/></svg>',
};
function renderTheme() {
  const theme = readTheme();
  applyTheme(theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const b = $("theme");
  setHtml(b, THEME_ICONS[next]);
  const label = next === "light" ? "Switch to day mode" : "Switch to night mode";
  b.title = label;
  b.setAttribute("aria-label", label);
  if (lastLegendMem) renderLegend(lastLegendMem);
}
/**
 * The CSS tips (data-tip): screen readers get the same text as a description of
 * the control, and Escape hides a showing tip until the pointer or focus moves.
 */
function wireTips() {
  for (const host of document.querySelectorAll<HTMLElement>("[data-tip]")) {
    const control = host.matches("button, input, [tabindex]") ? host : host.querySelector<HTMLElement>("input, button");
    const tip = host.dataset.tip;
    if (control && tip && tip.trim() !== (control.getAttribute("aria-label") ?? host.textContent ?? "").trim()) control.setAttribute("aria-description", tip);
  }
  const body = document.body;
  document.addEventListener("keydown", (e) => {
    // Only when a tip is up: otherwise Escape keeps its usual job (closing the popup).
    const showing = document.querySelector("[data-tip]:hover, [data-tip]:focus-visible, [data-tip]:has(:focus-visible), .vram-hint:hover, .vram-hint:focus-within");
    if (e.key === "Escape" && showing && !body.classList.contains("tips-off")) {
      body.classList.add("tips-off");
      e.preventDefault();
    }
  });
  const back = () => body.classList.remove("tips-off");
  document.addEventListener("pointermove", back, { passive: true });
  document.addEventListener("focusin", back);
}

function wireTheme() {
  renderTheme();
  $("theme").addEventListener("click", () => {
    saveTheme(readTheme() === "dark" ? "light" : "dark");
    renderTheme();
  });
  // The other view (popup vs panel) changed it.
  addEventListener("storage", (e) => {
    if (e.key === THEME_KEY || e.key === null) renderTheme();
  });
}

// Local state updates at once; storage gets the latest value, coalesced so a
// slider drag is a handful of writes rather than one per tick.
let pending: Partial<Settings> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  flushTimer = null;
  const patch = pending;
  pending = {};
  return setSettings(patch).catch((err) => console.warn("LlamaToaster: could not save settings", err));
}
async function save(patch: Partial<Settings>, now = false) {
  settings = { ...settings, ...patch };
  pending = { ...pending, ...patch };
  if (flushTimer) clearTimeout(flushTimer);
  if (now) await flush();
  else flushTimer = setTimeout(flush, 120);
  renderFit();
  await renderMemory();
}

/** Opens the browser's flags page on the WebGPU developer flag, which lets the browser report the card's memory. */
async function openFlagsPage() {
  const browser = browserFor(!!(navigator as Navigator & { brave?: unknown }).brave, navigator.userAgent);
  try {
    await chrome.tabs.create({ url: flagsPageUrl(browser), active: true });
  } catch (err) {
    console.warn("LlamaToaster: could not open the flags page", err);
  }
}

async function main() {
  wireTheme();
  wireTips();
  renderDock();
  void chrome.windows?.getCurrent().then((w) => (windowId = w.id));
  settings = await getSettings();
  gpu = await getGpu();
  ramInfo = ((await chrome.storage.local.get("ramInfo")).ramInfo as HelperRam | undefined) ?? null;
  // Detect again each time the popup opens: cheap, and catches a GPU switch.
  const fresh = await detectGpu();
  gpu = fresh;
  await chrome.storage.local.set({ gpu: fresh });

  const cpu = await readCpu();
  if (cpu) parts("cpu", `${cpu.model} · ${cpu.threads} threads`);
  else parts("cpu", "unknown");

  setHtml($("ticks"), ticksHtml());
  wireWhatIf();

  // Off / Manual / Auto: a rotary knob. The knob turns one stop; each word picks its position.
  $("leverSlot").addEventListener("click", () => void save({ mode: NEXT_MODE[settings.mode] }, true));
  for (const el of document.querySelectorAll<HTMLButtonElement>(".toggle-label")) {
    el.addEventListener("click", () => {
      if (el.dataset.mode !== settings.mode) void save({ mode: el.dataset.mode as Settings["mode"] }, true);
    });
  }

  $<HTMLInputElement>("ctx").addEventListener("input", (e) => {
    const c = ctxFromSlider(Number((e.target as HTMLInputElement).value));
    setFill(e.target as HTMLInputElement);
    $("ctxVal").textContent = `${ctxLabel(c)} tokens`;
    void save({ ctx: c });
  });
  // A tick label under the slider jumps the handle straight to that size.
  $("ticks").addEventListener("click", (e) => {
    const c = Number((e.target as HTMLElement).closest<HTMLElement>("[data-ctx]")?.dataset.ctx);
    if (c) void save({ ctx: c }, true);
  });
  $<HTMLInputElement>("ctx").addEventListener("pointerdown", () => (sliderDragging = true));
  for (const ev of ["pointerup", "pointercancel"]) window.addEventListener(ev, () => { sliderDragging = false; });
  // Releasing the slider (or the popup closing) saves straight away.
  $<HTMLInputElement>("ctx").addEventListener("change", () => void save({}, true));
  $<HTMLInputElement>("moreDetails").addEventListener("change", (e) => void save({ moreDetails: (e.target as HTMLInputElement).checked }, true));
  window.addEventListener("pagehide", () => {
    if (flushTimer) void flush();
  });
  wireKeep("ram");
  wireKeep("vram");
  $<HTMLSelectElement>("kind").addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    void save({ cpuOnly: v === "cpu", unifiedOverride: v === "auto" || v === "cpu" ? null : v === "unified" });
  });
  // chrome:// links can't be followed from an extension page: open them through tabs.create.
  $("flagsTip").addEventListener("click", (e) => {
    e.preventDefault();
    void openFlagsPage();
  });
  // Clicking into the field selects the whole value, so typing replaces it.
  const sizeField = $<HTMLInputElement>("vramTotal");
  let selectOnMouseUp = false;
  sizeField.addEventListener("focus", () => {
    selectOnMouseUp = true;
    sizeField.select();
  });
  // The mouse-up that ends the focusing click would otherwise drop the selection.
  sizeField.addEventListener("mouseup", (e) => {
    if (selectOnMouseUp) e.preventDefault();
    selectOnMouseUp = false;
  });
  // At most three digits before the point: the number is clamped as it is typed.
  $<HTMLInputElement>("vramTotal").addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    if (parseFloat(el.value) > 999) el.value = "999";
  });
  $<HTMLInputElement>("vramTotal").addEventListener("change", (e) => {
    const v = Math.min(999, parseFloat((e.target as HTMLInputElement).value));
    void setManualVram(cardName(), Number.isFinite(v) && v > 0 ? Math.round(v * 1024) : null).then(() => renderMemory());
  });

  // Side panel: open it from the popup's click (it needs the user gesture,
  // so no await before it); the background makes the toolbar button follow.
  $("dock").addEventListener("click", () => {
    if (inPanel) {
      void save({ sidePanel: false }, true).then(() => window.close());
      return;
    }
    const opening = windowId != null ? chrome.sidePanel.open({ windowId }) : Promise.reject(new Error("no window"));
    void save({ sidePanel: true }, true);
    opening.then(() => window.close()).catch((err) => console.warn("LlamaToaster: could not open the side panel", err));
  });

  // The marks legend starts open; its state is remembered.
  const ui = ((await chrome.storage.local.get("ui")).ui ?? {}) as { legendOpen?: boolean };
  const saveUi = (patch: typeof ui) => {
    Object.assign(ui, patch);
    void chrome.storage.local.set({ ui: { ...ui } });
  };
  const setLegendOpen = (open: boolean) => {
    $("legendHead").setAttribute("aria-expanded", String(open));
    $("fitLegend").hidden = !open;
  };
  setLegendOpen(ui.legendOpen !== false);
  $("legendHead").addEventListener("click", () => {
    const open = $("legendHead").getAttribute("aria-expanded") !== "true";
    setLegendOpen(open);
    saveUi({ legendOpen: open });
  });

  $("workerHead").addEventListener("click", () => {
    const open = $("workerHead").getAttribute("aria-expanded") !== "true";
    $("workerHead").setAttribute("aria-expanded", String(open));
    $("workerBody").hidden = !open;
  });

  chrome.storage.onChanged.addListener((changes) => {
    // Another view (popup vs panel) or a page changed a setting.
    if (changes.vramMemory) void renderMemory();
    if (changes.settings?.newValue && !flushTimer) {
      settings = { ...settings, ...(changes.settings.newValue as Settings) };
      renderFit();
      void renderMemory();
    }
  });

  renderFit();
  await renderMemory();
  // The memory speed test was removed; drop any result an older version saved.
  void chrome.storage.local.remove("bandwidth");
  setInterval(() => void renderMemory(), 2000);
  let askRam = true;
  const pollHelper = async () => {
    helperRes = await readHelper({ ram: askRam, apps: true });
    helper = helperRes.ok ? primaryGpu(helperRes.reading) : null;
    if (helperRes.ok) {
      // Asked once per open: it doesn't change, and on Linux it's a dmidecode run.
      askRam = false;
      if (helperRes.reading.ram) {
        ramInfo = helperRes.reading.ram;
        await chrome.storage.local.set({ ramInfo });
      }
    }
    await renderMemory();
  };
  void pollHelper();
  setInterval(() => void pollHelper(), 5000);
}

void main();
