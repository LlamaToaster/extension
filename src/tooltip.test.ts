import { describe, expect, it } from "vitest";
import { tipText } from "./tooltip";

const answer = {
  headline: "Partial offload: 59 of 66 layers on the GPU · MTP head",
  details: ["VRAM: needs 14.9 GB of 16.0 GB total, keeping 1.0 GB free", "File: 15.4 GB, 64 layers + MTP head"],
};

describe("hover text on a quant mark (tooltip.ts)", () => {
  it("shows only the one-line headline by default", () => {
    expect(tipText(answer, false)).toBe(answer.headline);
  });

  it("adds every figure, one per line, when More details is on", () => {
    expect(tipText(answer, true)).toBe([answer.headline, ...answer.details].join("\n"));
  });

  it("falls back to the headline when there are no details to add", () => {
    expect(tipText({ headline: "The check could not finish", details: [] }, true)).toBe("The check could not finish");
  });
});
