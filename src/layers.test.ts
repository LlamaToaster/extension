import { describe, expect, it } from "vitest";
import { fileLayersLabel, mtpNote, offloadTotalNote, transformerLayers } from "./layers";

// Qwen3.8-27B as its GGUF headers say (block_count, nextn_predict_layers):
// most quants keep the MTP head as the 65th block, the UD-IQ1/IQ2 quants drop it.
const keepsMtp = { nLayer: 65, mtpLayers: 1 };
const dropsMtp = { nLayer: 64, mtpLayers: 0 };

describe("layer counts (layers.ts)", () => {
  it("gives the same transformer count for a quant with the MTP head and one without", () => {
    expect(transformerLayers(keepsMtp)).toBe(64);
    expect(transformerLayers(dropsMtp)).toBe(64);
  });

  it("treats a missing nextn key as no MTP head", () => {
    expect(transformerLayers({ nLayer: 64, mtpLayers: null })).toBe(64);
    expect(fileLayersLabel({ nLayer: 64, mtpLayers: null })).toBe("64 layers, no MTP head");
  });

  it("says in the file label whether the MTP head is there", () => {
    expect(fileLayersLabel(keepsMtp)).toBe("64 layers + MTP head");
    expect(fileLayersLabel(dropsMtp)).toBe("64 layers, no MTP head");
  });

  it("ends the one-line headline with the MTP note, present or absent", () => {
    expect(mtpNote(keepsMtp)).toBe(" · MTP head");
    expect(mtpNote(dropsMtp)).toBe(" · no MTP head");
    expect(mtpNote({ nLayer: 64, mtpLayers: null })).toBe(" · no MTP head");
  });

  it("says what the offload total is made of (llama.cpp prints 66 and 65)", () => {
    expect(offloadTotalNote(keepsMtp)).toBe("64 + MTP head + output");
    expect(offloadTotalNote(dropsMtp)).toBe("64 + output");
    expect(keepsMtp.nLayer + 1).toBe(66);
    expect(dropsMtp.nLayer + 1).toBe(65);
  });

  it("never reports a negative count, even for a malformed header", () => {
    expect(transformerLayers({ nLayer: 0, mtpLayers: 1 })).toBe(0);
  });
});
