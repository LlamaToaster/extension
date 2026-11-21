import { describe, expect, it } from "vitest";
import { mapChipFiles } from "./fileMap";

const f = (path: string, size = 1000) => ({ path, size });

describe("mapChipFiles", () => {
  it("never points a quant chip at an MTP head, a draft, a projector or an imatrix", () => {
    const files = [f("gemma-Q8_0.gguf", 9000), f("MTP/mtp-gemma-Q8_0.gguf", 400), f("dspark-gemma-Q4_0.gguf", 200), f("gemma-Q4_0.gguf", 5000), f("gemma-dflash-BF16.gguf", 300), f("mmproj-F32.gguf"), f("imatrix_unsloth.gguf")];
    const { models, drafts } = mapChipFiles(["Q8_0", "Q4_0", "BF16"], files);
    expect(models.get("Q8_0")).toBe("gemma-Q8_0.gguf");
    expect(models.get("Q4_0")).toBe("gemma-Q4_0.gguf");
    expect(models.has("BF16")).toBe(false);
    // Hugging Face badges those itself: nothing of ours.
    expect(drafts.size).toBe(0);
  });

  it("a repo of drafts only, which Hugging Face shows without a badge, gets our badge on every chip", () => {
    const { models, drafts } = mapChipFiles(["Q4_0", "Q8_0"], [f("dspark-MiniCPM-Q4_0.gguf"), f("dspark-MiniCPM-Q8_0.gguf"), f("README.md")]);
    expect(models.size).toBe(0);
    expect([...drafts.values()].map((t) => t.label)).toEqual(["DSPARK", "DSPARK"]);
  });

  it("EAGLE3 drafts get our badge; a model named -MTP- stays a model", () => {
    expect(mapChipFiles(["F16"], [f("Qwen3-8B-speculator.eagle3-F16.gguf")]).drafts.get("F16")?.label).toBe("EAGLE3");
    expect(mapChipFiles(["Q4_K_M"], [f("Qwen3.6-27B-MTP-Q4_K_M.gguf")]).models.get("Q4_K_M")).toBe("Qwen3.6-27B-MTP-Q4_K_M.gguf");
  });
});
