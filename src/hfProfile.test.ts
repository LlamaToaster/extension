import { describe, expect, it } from "vitest";
import { HF_CHECK_EVERY_MS, fetchHfVramMib, hfCheckDue, matchHfCard, signedInHfVramMib, signedInUsername, skuCore, type HfHardwareItem } from "./hfProfile";

const ITEMS: HfHardwareItem[] = [
  { sku: ["GPU", "NVIDIA", "RTX 3090"], mem: 24, num: 2 },
  { sku: ["GPU", "NVIDIA", "RTX 3060"], mem: 12 },
  { sku: ["GPU", "NVIDIA", "RTX 3060 Laptop"], mem: 6 },
  { sku: ["GPU", "AMD", "RX 6600 XT"], mem: 8, isPrimary: true },
  { sku: ["GPU", "AMD", "RX 6600 XT"], mem: 8 },
  { sku: ["Apple Silicon", "-", "Apple M4"], mem: 16 },
];

/** A fake fetch that answers by URL: the signed-in name, the profile, or an error. */
function site(routes: Record<string, { status?: number; body: unknown }>, seen: { url: string; init?: RequestInit }[] = []) {
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    seen.push({ url: u, init });
    const hit = Object.entries(routes).find(([path]) => u.endsWith(path));
    if (!hit) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    return new Response(JSON.stringify(hit[1].body), { status: hit[1].status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchFn, seen };
}

describe("skuCore", () => {
  it("gives the same core for the profile's name and the browser's name", () => {
    expect(skuCore("RTX 3060")).toBe(skuCore("NVIDIA GeForce RTX 3060"));
    expect(skuCore("RX 6600 XT")).toBe(skuCore("AMD Radeon RX 6600 XT"));
    expect(skuCore("Arc B580")).toBe(skuCore("Intel(R) Arc(TM) B580 Graphics"));
  });
  it("keeps laptop cards apart from desktop cards", () => {
    expect(skuCore("RTX 3060 Laptop")).not.toBe(skuCore("NVIDIA GeForce RTX 3060"));
  });
});

describe("matchHfCard", () => {
  it("finds the user's card by name, and the primary entry when there are several", () => {
    expect(matchHfCard(ITEMS, "NVIDIA GeForce RTX 3060")?.mem).toBe(12);
    expect(matchHfCard(ITEMS, "AMD Radeon RX 6600 XT")?.isPrimary).toBe(true);
  });
  it("skips CPUs and Apple chips, and cards the profile doesn't list", () => {
    expect(matchHfCard(ITEMS, "Apple M4")).toBeNull();
    expect(matchHfCard(ITEMS, "NVIDIA GeForce RTX 4090")).toBeNull();
    expect(matchHfCard(ITEMS, "")).toBeNull();
  });
});

describe("fetchHfVramMib", () => {
  it("reads the card's memory from a public profile, in MiB, without cookies", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const { fetchFn } = site({ "/api/users/some-user/overview": { body: { hardwareItems: ITEMS } } }, seen);
    expect(await fetchHfVramMib("some-user", "NVIDIA GeForce RTX 3060", fetchFn)).toBe(12 * 1024);
    expect(seen[0]?.url).toBe("https://huggingface.co/api/users/some-user/overview");
    expect(seen[0]?.init?.credentials).toBe("omit");
  });
  it("is null for a card the profile doesn't list, or an error", async () => {
    expect(await fetchHfVramMib("some-user", "NVIDIA GeForce RTX 4090", site({ "/overview": { body: { hardwareItems: ITEMS } } }).fetchFn)).toBeNull();
    expect(await fetchHfVramMib("some-user", "NVIDIA GeForce RTX 3060", site({ "/overview": { status: 404, body: {} } }).fetchFn)).toBeNull();
    expect(await fetchHfVramMib("some-user", "NVIDIA GeForce RTX 3060", (async () => { throw new Error("offline"); }) as typeof fetch)).toBeNull();
  });
  it("sends nothing for an invalid username", async () => {
    const seen: { url: string }[] = [];
    const { fetchFn } = site({}, seen);
    expect(await fetchHfVramMib("bad user/../x", "NVIDIA GeForce RTX 3060", fetchFn)).toBeNull();
    expect(await fetchHfVramMib("", "NVIDIA GeForce RTX 3060", fetchFn)).toBeNull();
    expect(seen).toHaveLength(0);
  });
});

describe("signedInUsername", () => {
  it("asks who is signed in from the site itself, so the session cookies go with it", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const { fetchFn } = site({ "/api/whoami-v2": { body: { type: "user", name: "some-user" } } }, seen);
    expect(await signedInUsername(fetchFn)).toBe("some-user");
    expect(seen[0]?.url).toBe("https://huggingface.co/api/whoami-v2");
    expect(seen[0]?.init?.credentials).toBe("same-origin");
  });
  it("is null when nobody is signed in, the answer has no usable name, or the request fails", async () => {
    expect(await signedInUsername(site({ "/api/whoami-v2": { status: 401, body: { error: "Invalid username or password." } } }).fetchFn)).toBeNull();
    expect(await signedInUsername(site({ "/api/whoami-v2": { body: { type: "user", name: "bad name/../x" } } }).fetchFn)).toBeNull();
    expect(await signedInUsername((async () => { throw new Error("offline"); }) as typeof fetch)).toBeNull();
  });
});

describe("signedInHfVramMib", () => {
  it("reads the signed-in user's card, and asks the profile only once a name is known", async () => {
    const seen: { url: string }[] = [];
    const ok = site({ "/api/whoami-v2": { body: { name: "some-user" } }, "/api/users/some-user/overview": { body: { hardwareItems: ITEMS } } }, seen);
    expect(await signedInHfVramMib("NVIDIA GeForce RTX 3060", ok.fetchFn)).toBe(12 * 1024);
    expect(seen.map((s) => s.url)).toEqual(["https://huggingface.co/api/whoami-v2", "https://huggingface.co/api/users/some-user/overview"]);

    const seenOut: { url: string }[] = [];
    const out = site({ "/api/whoami-v2": { status: 401, body: { error: "Invalid username or password." } } }, seenOut);
    expect(await signedInHfVramMib("NVIDIA GeForce RTX 3060", out.fetchFn)).toBeNull();
    expect(seenOut).toHaveLength(1);
  });
});

describe("hfCheckDue", () => {
  const now = 10_000_000_000;
  const base = { readingKnown: false, saved: null, lastCheckedAt: null, now };
  it("asks when no reading and no remembered size covers the card, and it was never asked", () => {
    expect(hfCheckDue(base)).toBe(true);
  });
  it("does not ask when the browser or a worker already reads the card", () => {
    expect(hfCheckDue({ ...base, readingKnown: true })).toBe(false);
    expect(hfCheckDue({ ...base, saved: { source: "worker" } })).toBe(false);
    expect(hfCheckDue({ ...base, saved: { source: "browser" } })).toBe(false);
    expect(hfCheckDue({ ...base, saved: { source: "hf" } })).toBe(false);
  });
  it("still asks when only a typed size is remembered, since the profile outranks it", () => {
    expect(hfCheckDue({ ...base, saved: { source: "manual" } })).toBe(true);
  });
  it("asks at most once per hour", () => {
    expect(hfCheckDue({ ...base, lastCheckedAt: now - 1000 })).toBe(false);
    expect(hfCheckDue({ ...base, lastCheckedAt: now - HF_CHECK_EVERY_MS })).toBe(true);
  });
});
