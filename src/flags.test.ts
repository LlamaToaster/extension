import { describe, expect, it } from "vitest";
import { browserFor, flagsPageUrl, WEBGPU_DEVELOPER_FLAG } from "./flags";

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36";
const EDGE_UA = `${CHROME_UA} Edg/158.0.0.0`;

describe("flagsPageUrl", () => {
  it("opens the WebGPU developer flag on each browser's own flags page", () => {
    expect(WEBGPU_DEVELOPER_FLAG).toBe("enable-webgpu-developer-features");
    expect(flagsPageUrl("chrome")).toBe("chrome://flags/#enable-webgpu-developer-features");
    expect(flagsPageUrl("brave")).toBe("brave://flags/#enable-webgpu-developer-features");
    expect(flagsPageUrl("edge")).toBe("edge://flags/#enable-webgpu-developer-features");
  });
});

describe("browserFor", () => {
  it("knows Brave from its navigator.brave API, Edge from its user agent, and Chrome otherwise", () => {
    expect(browserFor(true, CHROME_UA)).toBe("brave");
    expect(browserFor(false, EDGE_UA)).toBe("edge");
    expect(browserFor(false, CHROME_UA)).toBe("chrome");
  });
});
