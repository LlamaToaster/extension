// How much of an Apple-silicon Mac's unified memory the GPU may use.
//
// Metal caps a device's working set (MTLDevice.recommendedMaxWorkingSetSize,
// printed by llama.cpp as "recommendedMaxWorkingSetSize"). It depends on the
// installed RAM, not on what is free, and it only covers memory Metal owns:
// layers left on the CPU (-ngl below the layer count) sit outside it.
//
// Apple does not publish the formula (the API docs only call the value an
// approximation). Community reports put it at about 75% of RAM; `sudo sysctl
// iogpu.wired_limit_mb=N` overrides it (0 = the default) until the next reboot.
// Prefer a value read from the machine (llama.cpp's own line, or the sysctl)
// over this estimate, and say it is an estimate wherever it is shown.

/** Share of unified memory assumed when nothing was read from the machine. */
export const METAL_ESTIMATE_SHARE = 0.75;

/** Tooltip/footnote text for a shown GPU budget, by where the number came from. */
export function metalBudgetNote(source: MetalBudgetSource): string {
  if (source === "listed") return "Read from llama.cpp (Metal's recommendedMaxWorkingSetSize on this Mac).";
  if (source === "sysctl") return "From the iogpu.wired_limit_mb setting on this Mac.";
  return "Estimate: about 75% of RAM. Apple does not publish the exact limit; it may differ on your Mac. Raise it with: sudo sysctl iogpu.wired_limit_mb=N";
}

export type MetalBudgetSource = "listed" | "sysctl" | "estimate";

export interface MetalBudget {
  mib: number;
  source: MetalBudgetSource;
}

/** The default limit for a machine with `totalMib` of unified memory. */
export function estimateMetalWorkingSetMib(totalMib: number): number {
  if (!(totalMib > 0)) return 0;
  return Math.round(totalMib * METAL_ESTIMATE_SHARE);
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
}): MetalBudget | null {
  if (!(input.totalMib > 0)) return null;
  if (input.listedMib != null && input.listedMib > 0) {
    return { mib: Math.min(Math.round(input.listedMib), input.totalMib), source: "listed" };
  }
  if (input.wiredLimitMib != null && input.wiredLimitMib > 0) {
    return { mib: Math.min(Math.round(input.wiredLimitMib), input.totalMib), source: "sysctl" };
  }
  return { mib: estimateMetalWorkingSetMib(input.totalMib), source: "estimate" };
}
