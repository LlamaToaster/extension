// How much of an Apple-silicon Mac's unified memory the GPU may use.
//
// Metal caps a device's working set (MTLDevice.recommendedMaxWorkingSetSize,
// printed by llama.cpp as "recommendedMaxWorkingSetSize"). It depends on the
// installed RAM, not on what is free, and it only covers memory Metal owns:
// layers left on the CPU (-ngl below the layer count) sit outside it.
//
// Apple does not publish the formula (the API docs only call the value an
// approximation), so the estimate below is fitted to community measurements
// (llama.cpp logs, MLX/PyTorch reports) and one M1 Pro (32 GiB, macOS 27.2.1:
// 25559 MiB = 78%). `sudo sysctl iogpu.wired_limit_mb=N` overrides the limit
// (0 = the default) until the next reboot. Prefer a value read from the machine
// (llama.cpp's own line, or the sysctl) over this estimate, and say it is an
// estimate wherever it is shown.
//
// Measured shares of RAM:
//   macOS before 26: 2/3 below 36 GiB (8 -> 5.33, 16 -> 10.67, 24 -> 16, 32 -> 21.33),
//                    3/4 from 36 GiB (36 -> 27, 64 -> 48, 96 -> 72, 128 -> 96)
//   macOS 26 and up: ~74% up to 24 GiB (16, 24 -> 17.76), ~78% for 32-48 GiB
//                    (32 -> 25559 MiB, 48 -> 37.44 GiB), ~81% from 64 GiB
//                    (64 -> 51.84 GiB, 96 -> 77.76 GiB)

const MIB_PER_GIB = 1024;
/** First macOS major (Tahoe) that uses the larger shares above. */
export const NEW_METAL_MACOS_MAJOR = 26;

/** The macOS major version in "27.2.1" or "macOS 14.5 (Sonoma)"; null when there is none. */
export function macosMajor(version: string | null | undefined): number | null {
  const m = /(\d+)(?:\.\d+)*/.exec(version ?? "");
  return m ? Number(m[1]) : null;
}

/** Tooltip/footnote text for a shown GPU budget, by where the number came from. */
export function metalBudgetNote(source: MetalBudgetSource, major?: number | null): string {
  if (source === "listed") return "Read from llama.cpp (Metal's recommendedMaxWorkingSetSize on this Mac).";
  if (source === "sysctl") return "From the iogpu.wired_limit_mb setting on this Mac.";
  const basis = major != null ? `RAM size and macOS ${major}` : "RAM size (macOS version unknown, so the more cautious older rule)";
  return `Estimate from ${basis}. Apple does not publish the limit, and it may differ on your Mac. Raise it with: sudo sysctl iogpu.wired_limit_mb=N`;
}

export type MetalBudgetSource = "listed" | "sysctl" | "estimate";

export interface MetalBudget {
  mib: number;
  source: MetalBudgetSource;
}

/**
 * The default limit for a machine with `totalMib` of unified memory. With no
 * macOS version the older (smaller) shares apply: they never overstate.
 */
export function estimateMetalWorkingSetMib(totalMib: number, major?: number | null): number {
  if (!(totalMib > 0)) return 0;
  const gib = totalMib / MIB_PER_GIB;
  let share: number;
  if (major != null && major >= NEW_METAL_MACOS_MAJOR) share = gib <= 24 ? 0.74 : gib <= 48 ? 0.78 : 0.81;
  else share = gib < 36 ? 2 / 3 : 0.75;
  return Math.round(totalMib * share);
}

/**
 * The GPU budget, best source first:
 *  - `listedMib`: the Metal device total llama.cpp reports (--list-devices),
 *    the figure the build really enforces;
 *  - `wiredLimitMib`: iogpu.wired_limit_mb when non-zero (the user raised or
 *    lowered it); never more than the installed RAM;
 *  - otherwise the estimate above.
 */
export function resolveMetalBudget(input: {
  totalMib: number;
  listedMib?: number | null;
  wiredLimitMib?: number | null;
  /** macOS major version, for the estimate. */
  macosMajor?: number | null;
}): MetalBudget | null {
  if (!(input.totalMib > 0)) return null;
  if (input.listedMib != null && input.listedMib > 0) {
    return { mib: Math.min(Math.round(input.listedMib), input.totalMib), source: "listed" };
  }
  if (input.wiredLimitMib != null && input.wiredLimitMib > 0) {
    return { mib: Math.min(Math.round(input.wiredLimitMib), input.totalMib), source: "sysctl" };
  }
  return { mib: estimateMetalWorkingSetMib(input.totalMib, input.macosMajor), source: "estimate" };
}
