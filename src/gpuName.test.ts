import { describe, expect, it } from "vitest";
import { gpuKey } from "./gpuName";

describe("gpuKey", () => {
  it("drops the vendor, so a browser's name and a shorter name meet", () => {
    expect(gpuKey("NVIDIA GeForce RTX 3060")).toBe(gpuKey("GeForce RTX 3060"));
    expect(gpuKey("AMD Radeon RX 6600 XT")).toBe(gpuKey("Radeon RX 6600 XT (Navi 23)"));
    expect(gpuKey("NVIDIA T400")).toBe(gpuKey("NVIDIA T400"));
  });
  it("keeps laptop GPUs apart from desktop cards", () => {
    expect(gpuKey("NVIDIA GeForce RTX 3060 Laptop GPU")).toBe(gpuKey("GeForce RTX 3060 Mobile/ Laptop"));
    expect(gpuKey("NVIDIA GeForce GTX 1050 Laptop GPU")).toBe(gpuKey("GeForce GTX 1050 (Notebook)"));
    expect(gpuKey("NVIDIA GeForce RTX 3060 Laptop GPU")).not.toBe(gpuKey("GeForce RTX 3060"));
  });
  it("ignores sizes, revisions and OEM marks in a name", () => {
    expect(gpuKey("GeForce RTX 3060 12 GB")).toBe(gpuKey("GeForce RTX 3060"));
    expect(gpuKey("GeForce GTX 1060 Rev. 2")).toBe(gpuKey("GeForce GTX 1060"));
    expect(gpuKey("GeForce RTX 3050 OEM")).toBe(gpuKey("GeForce RTX 3050"));
  });
  it("keeps different models apart", () => {
    expect(gpuKey("GeForce RTX 3060")).not.toBe(gpuKey("GeForce RTX 3060 Ti"));
    expect(gpuKey("Radeon RX 6600")).not.toBe(gpuKey("Radeon RX 6600 XT"));
  });
});
