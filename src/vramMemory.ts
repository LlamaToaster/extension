// VRAM sizes remembered per GPU, in chrome.storage.local. Each source keeps its
// own record, so a size read earlier can still be used when the source is gone:
//   worker   the LlamaToaster worker's measured total
//   browser  WebGPU's memory heaps (Chrome's "WebGPU Developer Features" flag)
//   hf       this card's entry in the user's Hugging Face hardware profile
//   manual   the size the user typed
// The popup and every Hugging Face page read the same store.

import { gpuKey } from "./gpuName";

export type VramSource = "worker" | "browser" | "hf" | "manual";
/** Order of trust, most first: a measured or read size beats a profile entry, which beats a typed one. */
export const VRAM_SOURCES: readonly VramSource[] = ["worker", "browser", "hf", "manual"];

export interface VramRecord {
  mib: number;
  /** When it was read or typed (epoch ms). */
  at: number;
}

/** The records for one GPU, by source. */
export type VramRecords = Partial<Record<VramSource, VramRecord>>;

/** Records by GPU key (gpuKey of the name the browser reports). */
export type VramStore = Record<string, VramRecords>;

export const VRAM_STORE_KEY = "vramMemory";

/** The GPU's key, or null when the name is unknown. */
export function vramKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = gpuKey(name);
  return key || null;
}

/** The size to use when no source is live now: the most trusted remembered record. */
export function savedVram(store: VramStore, name: string | null | undefined): { mib: number; source: VramSource } | null {
  const key = vramKey(name);
  const records = key ? store[key] : undefined;
  if (!records) return null;
  for (const source of VRAM_SOURCES) {
    const r = records[source];
    if (r && r.mib > 0) return { mib: r.mib, source };
  }
  return null;
}

export async function getVramStore(): Promise<VramStore> {
  const { [VRAM_STORE_KEY]: store } = await chrome.storage.local.get(VRAM_STORE_KEY);
  return (store as VramStore | undefined) ?? {};
}

/** Remembers a size read from a live source. Writes only when the value changed. */
export async function rememberVram(name: string | null | undefined, source: Exclude<VramSource, "manual">, mib: number): Promise<void> {
  const key = vramKey(name);
  if (!key || !(mib > 0)) return;
  const store = await getVramStore();
  const current = store[key]?.[source];
  if (current && current.mib === Math.round(mib)) return;
  store[key] = { ...store[key], [source]: { mib: Math.round(mib), at: Date.now() } };
  await chrome.storage.local.set({ [VRAM_STORE_KEY]: store });
}

/** The user typed a size (an empty value forgets it). It is the last choice in
 * savedVram: a size read from the browser, a worker or a Hugging Face profile wins. */
export async function setManualVram(name: string | null | undefined, mib: number | null): Promise<void> {
  const key = vramKey(name);
  if (!key) return;
  const store = await getVramStore();
  const records: VramRecords = { ...store[key] };
  if (mib == null || !(mib > 0)) delete records.manual;
  else records.manual = { mib: Math.round(mib), at: Date.now() };
  if (Object.keys(records).length === 0) delete store[key];
  else store[key] = records;
  await chrome.storage.local.set({ [VRAM_STORE_KEY]: store });
}
