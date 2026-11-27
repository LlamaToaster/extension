import { describe, expect, it } from "vitest";
import { cleanRendererName, integratedFromType, looksUnified, memoryPicture, vramFromHeaps } from "./hardware";
import { DEFAULT_SETTINGS, type GpuInfo } from "./settings";

describe("cleanRendererName", () => {
  it("names the Apple chip from ANGLE's Metal renderer string (Mac)", () => {
    expect(cleanRendererName("ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 27.2.1 (Build 26B131))")).toBe("Apple M1 Pro");
  });
  it("keeps the card name from ANGLE's Direct3D strings", () => {
    expect(cleanRendererName("ANGLE (NVIDIA, NVIDIA GeForce MX150 (0x00001D10) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.15.8266)")).toBe("NVIDIA GeForce MX150");
    expect(cleanRendererName("ANGLE (AMD, AMD Radeon RX 6600 XT (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)")).toBe("AMD Radeon RX 6600 XT");
  });
});

describe("looksUnified", () => {
  it("treats Apple silicon as unified memory, from the chip name or the vendor", () => {
    expect(looksUnified(cleanRendererName("ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Version 27.2.1 (Build 26B131))"), null)).toBe(true);
    expect(looksUnified("ANGLE", "Apple")).toBe(true);
  });
  it("treats integrated GPUs that share system RAM as unified", () => {
    expect(looksUnified("Intel(R) UHD Graphics 620", null)).toBe(true);
    expect(looksUnified("Intel(R) Arc(TM) 140V GPU", null)).toBe(true);
    expect(looksUnified("AMD Radeon(TM) Graphics", null)).toBe(true);
    expect(looksUnified("AMD Radeon 780M Graphics", null)).toBe(true);
  });
  it("does not treat discrete cards as unified, even where the iGPU patterns would match them", () => {
    expect(looksUnified("NVIDIA GeForce MX150", "NVIDIA")).toBe(false);
    expect(looksUnified("AMD Radeon RX 6600 XT", null)).toBe(false);
    expect(looksUnified("Intel(R) Arc(TM) A770 Graphics", null)).toBe(false);
    expect(looksUnified("Intel(R) Arc(TM) B580 Graphics", null)).toBe(false);
    expect(looksUnified("AMD Radeon RX Vega 64", null)).toBe(false);
  });
});

describe("vramFromHeaps", () => {
  it("sums the device-local heaps, in MiB (Brave with WebGPU developer features, RX 6600 XT)", () => {
    expect(vramFromHeaps([{ size: 8541933568, properties: 1 }, { size: 17140492288, properties: 30 }])).toBe(8146);
  });
  it("is null without heap data or without a device-local heap", () => {
    expect(vramFromHeaps(undefined)).toBeNull();
    expect(vramFromHeaps([])).toBeNull();
    expect(vramFromHeaps([{ size: 17140492288, properties: 30 }])).toBeNull();
  });
});

describe("integratedFromType", () => {
  it("reads WebGPU's adapter type, and says nothing when it is not given", () => {
    expect(integratedFromType("integrated GPU")).toBe(true);
    expect(integratedFromType("discrete GPU")).toBe(false);
    expect(integratedFromType(undefined)).toBeNull();
  });
});

describe("memoryPicture: where the VRAM total comes from", () => {
  const gpu: GpuInfo = { name: "AMD Radeon RX 6600 XT", vendor: "amd", architecture: "rdna-2", unified: false, noGpu: false, vramMib: 8146, detectedAt: 0 };
  const noBrowser: GpuInfo = { ...gpu, vramMib: null };
  const ram = { totalMib: 32768, availableMib: 20000 };
  it("the browser's reading is the total, and the whole card counts as free", () => {
    const m = memoryPicture(gpu, ram, DEFAULT_SETTINGS);
    expect(m.kind).toBe("vram");
    expect(m.deviceTotalMib).toBe(8146);
    expect(m.deviceFreeMib).toBe(8146);
    expect(m.vramUnknown).toBe(false);
    expect(m.measured).toBe(false);
    expect(m.totalFromBrowser).toBe(true);
    expect(m.totalFromSaved).toBeUndefined();
  });
  it("the browser's reading beats a remembered size", () => {
    const m = memoryPicture(gpu, ram, DEFAULT_SETTINGS, null, { mib: 12288, source: "hf" });
    expect(m.deviceTotalMib).toBe(8146);
    expect(m.totalFromBrowser).toBe(true);
  });
  it("without a reading, a remembered size is the total and says where it came from", () => {
    const hf = memoryPicture(noBrowser, ram, DEFAULT_SETTINGS, null, { mib: 8192, source: "hf" });
    expect(hf.vramUnknown).toBe(false);
    expect(hf.deviceTotalMib).toBe(8192);
    expect(hf.totalFromBrowser).toBe(false);
    expect(hf.totalFromSaved).toBe("hf");
    const typed = memoryPicture(noBrowser, ram, DEFAULT_SETTINGS, null, { mib: 4096, source: "manual" });
    expect(typed.deviceTotalMib).toBe(4096);
    expect(typed.totalFromSaved).toBe("manual");
  });
  it("with nothing read and nothing remembered, the total stays unknown", () => {
    const m = memoryPicture(noBrowser, ram, DEFAULT_SETTINGS);
    expect(m.vramUnknown).toBe(true);
    expect(m.totalFromBrowser).toBeUndefined();
    expect(m.totalFromSaved).toBeUndefined();
  });
});

describe("memoryPicture: the card list is no longer a source", () => {
  it("a card with a name in the old list is still unknown until a source gives its size", () => {
    const gpu: GpuInfo = { name: "NVIDIA GeForce RTX 3060", vendor: null, architecture: null, unified: false, noGpu: false, vramMib: null, detectedAt: 0 };
    const m = memoryPicture(gpu, { totalMib: 32768, availableMib: 20000 }, DEFAULT_SETTINGS);
    expect(m.vramUnknown).toBe(true);
  });
});

describe("memoryPicture: Apple silicon's Metal limit", () => {
  const mac: GpuInfo = { name: "Apple M2 Pro", vendor: "apple", architecture: null, unified: true, noGpu: false, vramMib: null, detectedAt: 0 };
  const helper = (extra: Record<string, unknown> = {}) =>
    ({ name: "Apple M2 Pro", vendor: "Apple", vendorId: 0x106b, deviceId: 0, integrated: true, dedicatedTotalMib: 0, sharedTotalMib: 32768, dedicatedUsedMib: null, sharedUsedMib: 8000, ...extra }) as never;
  it("without a helper: 2/3 of RAM up to 36 GiB, 3/4 above", () => {
    expect(memoryPicture(mac, { totalMib: 32768, availableMib: 30000 }, DEFAULT_SETTINGS).deviceTotalMib).toBe(Math.round((32768 * 2) / 3));
    expect(memoryPicture(mac, { totalMib: 65536, availableMib: 60000 }, DEFAULT_SETTINGS).deviceTotalMib).toBe(49152);
  });
  it("the helper's reading wins, capped at the pool", () => {
    const ram = { totalMib: 32768, availableMib: 30000 };
    expect(memoryPicture(mac, ram, DEFAULT_SETTINGS, helper({ gpuLimitMib: 28000 })).deviceTotalMib).toBe(28000);
    expect(memoryPicture(mac, ram, DEFAULT_SETTINGS, helper({ gpuLimitMib: 99999 })).deviceTotalMib).toBe(32768);
  });
  it("a helper without the field (older worker) falls back to the estimate", () => {
    expect(memoryPicture(mac, { totalMib: 32768, availableMib: 30000 }, DEFAULT_SETTINGS, helper()).deviceTotalMib).toBe(Math.round((32768 * 2) / 3));
  });
});
