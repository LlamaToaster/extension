// The browser's flags page for WebGPU developer features. With that flag on,
// WebGPU's adapter info gives the card's own memory (see hardware.ts vramFromHeaps).
// An extension cannot switch a flag itself: the popup only opens the page, and
// the user turns the flag on and restarts the browser.

/** The internal name of Chrome's "WebGPU Developer Features" flag. */
export const WEBGPU_DEVELOPER_FLAG = "enable-webgpu-developer-features";

export type FlagsBrowser = "chrome" | "brave" | "edge";

/** Which Chromium browser the popup runs in: Brave exposes navigator.brave, Edge's user agent names itself. */
export function browserFor(hasBraveApi: boolean, userAgent: string): FlagsBrowser {
  if (hasBraveApi) return "brave";
  if (/\bEdg\//.test(userAgent)) return "edge";
  return "chrome";
}

/** The flags page of that browser, scrolled to the flag. */
export function flagsPageUrl(browser: FlagsBrowser): string {
  return `${browser}://flags/#${WEBGPU_DEVELOPER_FLAG}`;
}
