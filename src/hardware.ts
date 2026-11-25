import type { HelperGpu } from "./helper";
import { isFastUnified } from "../shared/fitGrade";
// What a browser can learn about the machine's memory.
//
// RAM: chrome.system.memory gives the real total and available figures.
// GPU: WebGL's unmasked renderer string names the card; WebGPU says the
// vendor and whether a real adapter exists. With Chrome's "WebGPU Developer
// Features" flag on, WebGPU's adapter info also gives the card's own memory
// (the device-local heap, see vramFromHeaps) and its type. How much of that
// memory is free is not reported by any browser API: only the worker's native
// helper reads it (see helper.ts). Without a helper the whole card counts as
// available. Without a browser total either, the size comes from the store of
// remembered sizes (vramMemory.ts): a worker or browser reading from before, the
// user's Hugging Face profile, or the size the user typed.

import type { GpuInfo, Settings } from "./settings";
import type { VramSource } from "./vramMemory";

// GPUs that draw from system RAM rather than their own memory.
const UNIFIED_PATTERNS = [
  /Apple/i,
  /Intel.*(UHD|Iris|HD Graphics)/i,
  /Intel.*Arc.*(1[34]0V|Graphics)\b/i,
  /Radeon\s*\(TM\)\s*Graphics/i,
  /Radeon\s*Graphics/i,
  /Radeon.*\b(6[0-9]0M|7[0-9]0M|8[0-9]0M|8[0-9]0S|Vega\s*\d+\b(?!\s*(56|64)))/i,
  /Adreno/i,
  /Mali/i,
];

// Discrete cards the unified patterns above would also match: Arc A/B-series
// ("Intel(R) Arc(TM) A770 Graphics"), Radeon RX Vega 56/64.
const DISCRETE_PATTERNS = [/\b[AB]\d{3}\b/, /Vega\s*(56|64)\b/i, /RX\s*Vega/i];

export function looksUnified(name: string | null, vendor: string | null): boolean {
  if (vendor && /apple/i.test(vendor)) return true;
  if (!name) return false;
  if (DISCRETE_PATTERNS.some((re) => re.test(name))) return false;
  return UNIFIED_PATTERNS.some((re) => re.test(name));
}

/** "ANGLE (AMD, AMD Radeon RX 6600 XT (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "AMD Radeon RX 6600 XT". */
export function cleanRendererName(raw: string): string {
  let s = raw.trim();
  const angle = /^ANGLE \((.*)\)$/.exec(s);
  if (angle) {
    const parts = angle[1].split(", ");
    s = parts.length >= 2 ? parts[1] : parts[0];
  }
  // Metal's ANGLE string names the chip after "ANGLE Metal Renderer:". Strip that
  // label first: the Metal cut below would otherwise leave just "ANGLE".
  s = s.replace(/^ANGLE Metal Renderer:\s*/i, "");
  return s
    .replace(/\s*\(0x[0-9a-f]+\)/gi, "")
    .replace(/\s*(Direct3D|D3D)\d*.*$/i, "")
    .replace(/\s*(vs|ps)_\d_\d.*$/i, "")
    .replace(/\s*OpenGL.*$/i, "")
    .replace(/\s*Metal.*$/i, "")
    .replace(/\/PCIe\/SSE2/i, "")
    .trim();
}

function webglRenderer(): string | null {
  try {
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
    const gl = (canvas as HTMLCanvasElement).getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof raw === "string" && raw ? raw : null;
  } catch {
    return null;
  }
}

/** The device-local memory heap is the card's own memory. */
const DEVICE_LOCAL_HEAP = 1;

/** The card's own memory in MiB, from WebGPU's memory heaps (adapter info with
 * Chrome's "WebGPU Developer Features" flag on). Null when the heaps are not
 * given or hold no device-local memory. */
export function vramFromHeaps(heaps: unknown): number | null {
  if (!Array.isArray(heaps)) return null;
  let bytes = 0;
  for (const h of heaps as ({ size?: unknown; properties?: unknown } | null)[]) {
    if (typeof h?.size === "number" && typeof h.properties === "number" && (h.properties & DEVICE_LOCAL_HEAP) !== 0) bytes += h.size;
  }
  return bytes > 0 ? Math.round(bytes / 1048576) : null;
}

/** WebGPU's adapter type ("discrete GPU", "integrated GPU", ...), with the developer flag on. Null when not given. */
export function integratedFromType(type: unknown): boolean | null {
  if (type === "integrated GPU") return true;
  if (type === "discrete GPU" || type === "external GPU") return false;
  return null;
}

/** Detects the GPU (call from a page: popup or content script). */
export async function detectGpu(): Promise<GpuInfo> {
  const renderer = webglRenderer();
  let vendor: string | null = null;
  let architecture: string | null = null;
  let description: string | null = null;
  let noGpu = false;
  let vramMib: number | null = null;
  let integrated: boolean | null = null;
  // WebGL names the card when it can. WebGPU is asked either way, for the memory
  // heaps and the adapter type, which only its adapter info gives (with the
  // developer flag). Its name, vendor and "no adapter" answers are used only
  // when WebGL gave nothing. Chrome logs "No available adapters." to the
  // extension's Errors list when a page asks and none answers, even though it is caught.
  try {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    const adapter = gpu ? await gpu.requestAdapter(/Windows/.test(navigator.userAgent) ? undefined : { powerPreference: "high-performance" }) : null;
    if (!adapter) {
      if (!renderer) noGpu = true;
    } else {
      const info = adapter.info as (GPUAdapterInfo & { isFallbackAdapter?: boolean; memoryHeaps?: unknown; type?: unknown }) | undefined;
      if (!renderer) {
        vendor = info?.vendor || null;
        architecture = info?.architecture || null;
        description = info?.description || null;
        if (info?.isFallbackAdapter) noGpu = true;
      }
      vramMib = vramFromHeaps(info?.memoryHeaps);
      integrated = integratedFromType(info?.type);
    }
  } catch {
    // No WebGPU: fall back on WebGL alone.
  }
  const name = renderer ? cleanRendererName(renderer) : description;
  // A software renderer means Chrome has lost its GPU (it draws on Microsoft's
  // Basic Render Driver or SwiftShader). That is not "no GPU" for the machine.
  const softwareRenderer = !!name && /SwiftShader|llvmpipe|Software|Basic Render/i.test(name);
  if (softwareRenderer) noGpu = true;
  if (!renderer && noGpu === false && !vendor) noGpu = true;
  return {
    name,
    vendor,
    architecture,
    // The adapter's own type decides when the browser gives it; the name guesses otherwise.
    unified: integrated ?? looksUnified(name, vendor),
    noGpu,
    softwareRenderer,
    vramMib,
    detectedAt: Date.now(),
  };
}

export interface RamReading {
  totalMib: number;
  availableMib: number;
  /** The native helper's GPU reading, when the helper is installed. */
  helper?: HelperGpu | null;
  /** Resident RAM of the llama.cpp processes, from the helper. */
  llamaRamMib?: number;
}

export async function readRam(): Promise<RamReading | null> {
  try {
    const m = await chrome.system.memory.getInfo();
    return { totalMib: m.capacity / 1048576, availableMib: m.availableCapacity / 1048576 };
  } catch {
    return null;
  }
}

export interface CpuReading {
  model: string;
  threads: number;
}

export async function readCpu(): Promise<CpuReading | null> {
  try {
    const c = await chrome.system.cpu.getInfo();
    return { model: c.modelName.trim(), threads: c.numOfProcessors };
  } catch {
    return null;
  }
}

/** The memory picture the fit check runs against. */
export interface MemoryPicture {
  kind: "vram" | "unified" | "cpu";
  /** Device memory fit may fill, MiB (0 for CPU only). */
  deviceTotalMib: number;
  deviceFreeMib: number;
  ramTotalMib: number | null;
  ramAvailableMib: number | null;
  /** The VRAM total was not found and not entered. */
  vramUnknown: boolean;
  /** Totals and free memory come from the native helper, not an estimate. */
  measured: boolean;
  /** The VRAM total is the browser's own reading (WebGPU memory heaps, developer
   * features flag). Free memory is not known: the whole card counts as free. */
  totalFromBrowser?: boolean;
  /** The VRAM total is not read now but was remembered: the source that gave it earlier (a worker or browser reading, the Hugging Face profile, or the size typed by the user). */
  totalFromSaved?: VramSource;
  /** Unified memory fast enough to grade like VRAM (Apple silicon, Strix
   * Halo, GB10); an integrated GPU on ordinary DDR grades like the CPU. */
  fastUnified?: boolean;
}

/** The size remembered for this card (savedVram in vramMemory.ts), used when nothing reads it now. */
export type SavedVram = { mib: number; source: VramSource } | null;

export function memoryPicture(gpu: GpuInfo | null, ram: RamReading | null, s: Settings, helper: HelperGpu | null = null, saved: SavedVram = null): MemoryPicture {
  const real = realPicture(gpu, ram, s, helper, saved);
  return s.whatIf ? whatIfPicture(real, s) : real;
}

/** "What if" swaps in an imagined, empty machine: the chosen RAM and VRAM
 * sizes, all of it free. The memory kind stays the real one; a CPU-only
 * machine imagined with VRAM becomes a dedicated-GPU machine. */
export function whatIfPicture(real: MemoryPicture, s: Settings): MemoryPicture {
  const ram = s.whatIfRamMib ?? real.ramTotalMib;
  const vram = s.whatIfVramMib ?? (real.kind === "unified" ? null : real.deviceTotalMib);
  const out: MemoryPicture = { ...real, ramTotalMib: ram, ramAvailableMib: ram, vramUnknown: false, measured: false, totalFromBrowser: false, totalFromSaved: undefined };
  if (real.kind === "unified") {
    // Unified memory follows the imagined RAM (Apple keeps ~3/4 for Metal).
    const share = real.ramTotalMib ? real.deviceTotalMib / real.ramTotalMib : 1;
    const dev = (ram ?? 0) * share;
    return { ...out, deviceTotalMib: dev, deviceFreeMib: dev };
  }
  const dev = vram ?? 0;
  return { ...out, kind: dev > 0 ? "vram" : "cpu", deviceTotalMib: dev, deviceFreeMib: dev };
}

function realPicture(gpu: GpuInfo | null, ram: RamReading | null, s: Settings, helper: HelperGpu | null, saved: SavedVram): MemoryPicture {
  const ramTotal = ram?.totalMib ?? null;
  const ramAvail = ram?.availableMib ?? null;
  if (helper && !s.cpuOnly && s.unifiedOverride == null) {
    const base = { ramTotalMib: ramTotal, ramAvailableMib: ramAvail, vramUnknown: false, measured: true };
    if (helper.integrated || helper.vendor === "Apple") {
      // Integrated GPUs run from the shared pool the OS gives them
      // (Windows: half of RAM; macOS: reported as all RAM, Metal uses ~3/4).
      const apple = helper.vendor === "Apple";
      const pool = helper.sharedTotalMib ?? ramTotal ?? 0;
      const total = apple ? pool * 0.75 : pool;
      const used = helper.sharedUsedMib ?? 0;
      const free = Math.max(0, Math.min(total, pool - used, ramAvail ?? Infinity));
      return { kind: "unified", deviceTotalMib: total, deviceFreeMib: free, ...base, fastUnified: apple || isFastUnified([helper.name]) };
    }
    // The worker's measured total is the first source: nothing else overrides it.
    const total = helper.dedicatedTotalMib;
    const used = helper.dedicatedUsedMib ?? 0;
    return { kind: "vram", deviceTotalMib: total, deviceFreeMib: Math.max(0, total - used), ...base };
  }
  return estimatedPicture(gpu, ram, s, saved);
}

function estimatedPicture(gpu: GpuInfo | null, ram: RamReading | null, s: Settings, saved: SavedVram): MemoryPicture {
  const ramTotal = ram?.totalMib ?? null;
  const ramAvail = ram?.availableMib ?? null;
  const noGpu = s.cpuOnly || !gpu || gpu.noGpu;
  if (noGpu) return { kind: "cpu", deviceTotalMib: 0, deviceFreeMib: 0, ramTotalMib: ramTotal, ramAvailableMib: ramAvail, vramUnknown: false, measured: false };
  const unified = s.unifiedOverride ?? gpu.unified;
  if (unified) {
    // Metal's working-set budget is about 3/4 of RAM; an integrated GPU
    // elsewhere can use what the OS has available.
    const apple = /apple/i.test(gpu.vendor ?? "") || /apple/i.test(gpu.name ?? "");
    const total = ramTotal != null ? (apple ? ramTotal * 0.75 : ramTotal) : 0;
    const free = ramAvail != null ? Math.min(total, ramAvail) : total;
    return {
      kind: "unified",
      deviceTotalMib: total,
      deviceFreeMib: free,
      ramTotalMib: ramTotal,
      ramAvailableMib: ramAvail,
      vramUnknown: false,
      measured: false,
      fastUnified: apple || isFastUnified([gpu.name, gpu.vendor]),
    };
  }
  // Without a worker, the total is the browser's own reading (WebGPU memory
  // heaps, developer features flag) when there is one; otherwise the size
  // remembered for this card (a reading from before, a Hugging Face profile
  // entry, or the size the user typed). Nothing is guessed from the name.
  const browserTotal = gpu.vramMib ?? null;
  const total = browserTotal ?? saved?.mib ?? null;
  if (total == null) return { kind: "vram", deviceTotalMib: 0, deviceFreeMib: 0, ramTotalMib: ramTotal, ramAvailableMib: ramAvail, vramUnknown: true, measured: false };
  return {
    kind: "vram",
    deviceTotalMib: total,
    // Without a worker nothing reads what other apps hold: the whole card counts.
    deviceFreeMib: total,
    ramTotalMib: ramTotal,
    ramAvailableMib: ramAvail,
    vramUnknown: false,
    measured: false,
    totalFromBrowser: browserTotal != null,
    totalFromSaved: browserTotal == null ? saved?.source : undefined,
  };
}
