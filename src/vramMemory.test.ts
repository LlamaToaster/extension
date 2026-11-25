import { describe, expect, it } from "vitest";
import { savedVram, vramKey, type VramStore } from "./vramMemory";

describe("vramKey", () => {
  it("keys a card by its name, so vendor words and laptop marks don't split it", () => {
    expect(vramKey("NVIDIA GeForce RTX 3060")).toBe(vramKey("GeForce RTX 3060"));
    expect(vramKey("NVIDIA GeForce RTX 3060 Laptop GPU")).not.toBe(vramKey("NVIDIA GeForce RTX 3060"));
    expect(vramKey(null)).toBeNull();
    expect(vramKey("")).toBeNull();
  });
});

describe("savedVram", () => {
  const key = vramKey("AMD Radeon RX 6600 XT")!;
  it("returns the most trusted remembered source: worker, then browser, then profile, then typed", () => {
    const store: VramStore = {
      [key]: {
        manual: { mib: 4096, at: 1 },
        hf: { mib: 8192, at: 2 },
      },
    };
    expect(savedVram(store, "AMD Radeon RX 6600 XT")).toEqual({ mib: 8192, source: "hf" });
    store[key]!.browser = { mib: 8146, at: 3 };
    expect(savedVram(store, "AMD Radeon RX 6600 XT")).toEqual({ mib: 8146, source: "browser" });
    store[key]!.worker = { mib: 8176, at: 4 };
    expect(savedVram(store, "AMD Radeon RX 6600 XT")).toEqual({ mib: 8176, source: "worker" });
  });
  it("is null for a card with nothing remembered, or no name", () => {
    expect(savedVram({}, "AMD Radeon RX 6600 XT")).toBeNull();
    expect(savedVram({ [key]: { manual: { mib: 0, at: 1 } } }, "AMD Radeon RX 6600 XT")).toBeNull();
    expect(savedVram({}, null)).toBeNull();
  });
});
