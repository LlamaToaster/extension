import { describe, expect, it } from "vitest";
import { mapDraftFiles, mapFiles } from "./fileMap";

describe("mapFiles", () => {
  it("never points a quant chip at an MTP head or a DFlash/DSpark draft", () => {
    const files = ["gemma-Q8_0.gguf", "MTP/mtp-gemma-Q8_0.gguf", "dspark-gemma-Q4_0.gguf", "gemma-Q4_0.gguf", "gemma-dflash-BF16.gguf", "mmproj-F32.gguf"];
    const m = mapFiles(["Q8_0", "Q4_0", "BF16"], files);
    expect(m.get("Q8_0")).toBe("gemma-Q8_0.gguf");
    expect(m.get("Q4_0")).toBe("gemma-Q4_0.gguf");
    expect(m.has("BF16")).toBe(false);
  });
});

describe("mapDraftFiles", () => {
  it("finds the chips of a repo that holds drafts only, which Hugging Face shows without a badge", () => {
    const files = ["dspark-MiniCPM-Q4_0.gguf", "dspark-MiniCPM-Q8_0.gguf", "README.md"];
    expect(mapFiles(["Q4_0", "Q8_0"], files).size).toBe(0);
    expect([...mapDraftFiles(["Q4_0", "Q8_0"], files).keys()].sort()).toEqual(["Q4_0", "Q8_0"]);
  });
});
