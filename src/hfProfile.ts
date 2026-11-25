// The card a user picked in their Hugging Face hardware settings. On a Hugging
// Face page the extension asks Hugging Face who is signed in (the same request
// the site makes, sent with the browser's own Hugging Face cookies), then reads
// that user's public profile: GET /api/users/<name>/overview, field hardwareItems,
// sent without cookies. The card's memory is the size the user gave on Hugging
// Face, not a measurement.

import { gpuKey } from "./gpuName";
import type { VramSource } from "./vramMemory";

/** Hugging Face usernames: letters, digits, "-", "_" and ".". */
const HF_USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

/** How often a page may ask Hugging Face again while no size is known. */
export const HF_CHECK_EVERY_MS = 60 * 60 * 1000;

export interface HfHardwareItem {
  sku: string[];
  /** Memory per card, GB. */
  mem?: number;
  num?: number;
  isPrimary?: boolean;
}

/** A card name reduced to what both lists share: "NVIDIA GeForce RTX 3060" and "RTX 3060" give "rtx 3060". */
export function skuCore(name: string): string {
  return gpuKey(name)
    .replace(/^(geforce|radeon) /, "")
    .replace(/ graphics$/, "");
}

/** The GPU entry on the user's list for this card, the primary one first. Null when none matches. */
export function matchHfCard(items: HfHardwareItem[], gpuName: string): HfHardwareItem | null {
  const want = skuCore(gpuName);
  if (!want) return null;
  const hits = items.filter((i) => Array.isArray(i.sku) && i.sku[0] === "GPU" && typeof i.mem === "number" && i.mem > 0 && skuCore(i.sku[2] ?? "") === want);
  return hits.find((i) => i.isPrimary) ?? hits[0] ?? null;
}

/** The name of the user signed in to Hugging Face in this browser, or null when nobody is. Sent from a huggingface.co page, so the browser attaches the session cookies. */
export async function signedInUsername(fetchFn: typeof fetch = fetch): Promise<string | null> {
  let res: Response;
  try {
    res = await fetchFn("https://huggingface.co/api/whoami-v2", { credentials: "same-origin", cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { name?: unknown } | null;
  return typeof body?.name === "string" && HF_USERNAME.test(body.name) ? body.name : null;
}

/** The card's memory in MiB from a user's Hugging Face profile, or null when the profile doesn't list it or can't be read. */
export async function fetchHfVramMib(username: string, gpuName: string, fetchFn: typeof fetch = fetch): Promise<number | null> {
  const user = username.trim();
  if (!HF_USERNAME.test(user)) return null;
  let res: Response;
  try {
    res = await fetchFn(`https://huggingface.co/api/users/${encodeURIComponent(user)}/overview`, { credentials: "omit", cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { hardwareItems?: unknown } | null;
  const items = Array.isArray(body?.hardwareItems) ? (body.hardwareItems as HfHardwareItem[]) : [];
  const hit = matchHfCard(items, gpuName);
  return hit ? Math.round((hit.mem ?? 0) * 1024) : null;
}

/** The card's memory from the hardware list of the user signed in here, or null when nobody is signed in or the card isn't listed. */
export async function signedInHfVramMib(gpuName: string, fetchFn: typeof fetch = fetch): Promise<number | null> {
  const user = await signedInUsername(fetchFn);
  return user ? fetchHfVramMib(user, gpuName, fetchFn) : null;
}

/** Whether a page should ask Hugging Face now. Not when a reading of the card's
 * own memory exists, or a size better than one typed by hand is remembered, and
 * at most once per HF_CHECK_EVERY_MS. */
export function hfCheckDue(p: { readingKnown: boolean; saved: { source: VramSource } | null; lastCheckedAt: number | null; now: number }): boolean {
  if (p.readingKnown) return false;
  if (p.saved && p.saved.source !== "manual") return false;
  return p.lastCheckedAt == null || p.now - p.lastCheckedAt >= HF_CHECK_EVERY_MS;
}
