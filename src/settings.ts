// What the user picks (context, cache type, margin, memory overrides) and what
// was detected/measured, kept in chrome.storage so the popup and every
// Hugging Face tab see the same values and update together.

export interface GpuInfo {
  /** Best name found: WebGL's unmasked renderer, else WebGPU's description. */
  name: string | null;
  vendor: string | null;
  architecture: string | null;
  /** Total VRAM from the lookup table, MiB; null when the GPU is not in it. */
  tableVramMib: number | null;
  /** The GPU shares system memory (Apple silicon, integrated graphics). */
  unified: boolean;
  /** WebGPU is unavailable or only a software adapter answered. */
  noGpu: boolean;
  detectedAt: number;
}

/** How much memory the fit keeps free: a fixed amount (any value, set on the
 * popup's lever), or what is in use when the check starts (captured once, so
 * the marks don't move as usage moves). "custom" is an older saved value: it
 * reads as "preset" with the typed amount. */
export type MarginMode = "preset" | "current";

export interface Settings {
  /** "auto": every GGUF page is checked as it opens. "manual": only when the
   * toaster on the page is clicked. */
  mode: "manual" | "auto";
  ctx: number;
  marginMode: MarginMode;
  /** The fixed amount kept free on the GPU (marginMode "preset"), MiB. */
  marginMib: number;
  /** Kept free in system RAM: the same two modes as the GPU's. */
  ramMarginMode: MarginMode;
  /** The fixed amount kept free in RAM (ramMarginMode "preset"), MiB. */
  ramMarginMib: number;
  /** User-entered total VRAM, MiB; null = use the table. */
  vramOverrideMib: number | null;
  /** null = auto (detected). */
  unifiedOverride: boolean | null;
  /** Run as CPU-only regardless of the GPU found. */
  cpuOnly: boolean;
  /** The toolbar button opens the side panel instead of the popup. */
  sidePanel: boolean;
  /** "What if": check against imagined RAM/VRAM sizes instead of this machine. */
  whatIf: boolean;
  /** Imagined sizes, MiB; null = this machine's own. */
  whatIfRamMib: number | null;
  whatIfVramMib: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "manual",
  ctx: 4096,
  marginMode: "preset",
  marginMib: 1024,
  // "In use now" for RAM is what the check did before RAM had a setting:
  // the model gets what the OS reports as available.
  ramMarginMode: "current",
  ramMarginMib: 4096,
  vramOverrideMib: null,
  unifiedOverride: null,
  cpuOnly: false,
  sidePanel: false,
  whatIf: false,
  whatIfRamMib: null,
  whatIfVramMib: null,
};

/** What-if slider stops, GB (roughly log-spaced). Each slider also gets a
 * stop at this machine's own size. */
export const WHATIF_STOPS_GB = {
  ram: [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024],
  vram: [4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384],
  unified: [8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 512, 1024],
};
export type WhatIfScale = keyof typeof WHATIF_STOPS_GB;

/** The stops in MiB, with the own size inserted (rounded to 0.1 GB). */
export function whatIfStops(scale: WhatIfScale, ownMib: number | null): number[] {
  const stops = WHATIF_STOPS_GB[scale].map((g) => g * 1024);
  if (ownMib != null && ownMib > 0) {
    const own = Math.round(ownMib / 102.4) * 102.4;
    if (!stops.some((s) => Math.abs(s - own) < 256)) stops.push(own);
  }
  return stops.sort((a, b) => a - b);
}

/** The stop nearest a value (log distance). */
export function whatIfIndex(stops: number[], mib: number): number {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(Math.log(stops[i] / mib)) < Math.abs(Math.log(stops[best] / mib))) best = i;
  }
  return best;
}

export * from "./ctxSlider";

// Settings live in storage.local: storage.sync allows ~120 writes a minute,
// and dragging the context slider writes on every tick, so sync ran out of
// quota and the pages silently stopped following the slider. Old sync values
// are read once as a fallback.
export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  let saved = settings as Partial<Settings> | undefined;
  if (!saved) {
    try {
      saved = (await chrome.storage.sync.get("settings")).settings as Partial<Settings> | undefined;
    } catch {
      // sync unavailable: defaults
    }
  }
  const out = { ...DEFAULT_SETTINGS, ...(saved ?? {}) } as Settings & { customMarginMib?: number };
  // The typed-amount mode became the lever's free value.
  if ((out.marginMode as string) === "custom") {
    out.marginMode = "preset";
    if (typeof out.customMarginMib === "number") out.marginMib = out.customMarginMib;
  }
  delete out.customMarginMib;
  return out;
}

// Writes run one after another, so a slow early write can never land after
// (and overwrite) a later one.
let writeChain: Promise<unknown> = Promise.resolve();
export function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const run = writeChain.then(async () => {
    const next = { ...(await getSettings()), ...patch };
    await chrome.storage.local.set({ settings: next });
    return next;
  });
  writeChain = run.catch(() => undefined);
  return run;
}

export async function getGpu(): Promise<GpuInfo | null> {
  const { gpu } = await chrome.storage.local.get("gpu");
  return (gpu as GpuInfo | undefined) ?? null;
}

