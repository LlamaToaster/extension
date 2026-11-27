// How much of an Apple-silicon Mac's unified memory the GPU may use.
//
// Metal caps a device's working set (MTLDevice.recommendedMaxWorkingSetSize,
// printed by llama.cpp as "recommendedMaxWorkingSetSize"). It depends on the
// installed RAM, not on what is free, and it only covers memory Metal owns:
// layers left on the CPU (-ngl below the layer count) sit outside it.
//
// Apple does not publish the formula. Reports and llama.cpp logs agree on about
// 2/3 of RAM up to ~36 GiB and 3/4 above it (16 GiB -> ~10.7, 32 -> ~21.3,
// 64 -> 48, 96 -> 72). `sudo sysctl iogpu.wired_limit_mb=N` overrides it (0 =
// the default) until the next reboot. Prefer a value read from the machine
// (llama.cpp's own line, or the sysctl) over this estimate.

const MIB_PER_GIB = 1024;
/** Up to and including this much RAM the limit is the smaller fraction. */
const SMALL_MAC_MAX_MIB = 36 * MIB_PER_GIB;

export type MetalBudgetSource = "listed" | "sysctl" | "estimate";

export interface MetalBudget {
  mib: number;
  source: MetalBudgetSource;
}

/** The default limit for a machine with `totalMib` of unified memory. */
export function estimateMetalWorkingSetMib(totalMib: number): number {
  if (!(totalMib > 0)) return 0;
  return Math.round(totalMib * (totalMib <= SMALL_MAC_MAX_MIB ? 2 / 3 : 3 / 4));
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
