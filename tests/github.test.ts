import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitError, fetchSnapshot, parseRepo } from "../src/github";

describe("parseRepo", () => {
  it("accepts owner/name", () => {
    expect(parseRepo("vitejs/vite")).toEqual({ owner: "vitejs", name: "vite" });
  });

  it("accepts GitHub URLs", () => {
    expect(parseRepo("https://github.com/mrdoob/three.js")).toEqual({ owner: "mrdoob", name: "three.js" });
    expect(parseRepo("github.com/keito118/commit-city.git")).toEqual({ owner: "keito118", name: "commit-city" });
    expect(parseRepo("https://github.com/vitejs/vite/tree/main/packages")).toEqual({ owner: "vitejs", name: "vite" });
  });

  it("rejects anything else", () => {
    expect(parseRepo("vite")).toBeNull();
    expect(parseRepo("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("fetchSnapshot", () => {
  const tree = { tree: [{ path: "a.ts", type: "blob", size: 100 }], truncated: false };

  /** A fake GitHub that allows `budget` requests, then answers like the real rate limit. */
  function fakeGitHub(budget: number) {
    let left = budget;
    return vi.fn(async (url: string) => {
      const headers = new Headers({ "x-ratelimit-remaining": String(Math.max(left - 1, 0)), "x-ratelimit-reset": "2000000000" });
      if (left <= 0) return new Response("{}", { status: 403, headers });
      left--;
      const body = url.includes("/git/trees/")
        ? tree
        : /\/commits\?/.test(url)
          ? Array.from({ length: 25 }, (_, i) => ({ sha: `c${i}`, parents: [{}] }))
          : /\/commits\/c/.test(url)
            ? { commit: { author: { date: "2026-01-01T00:00:00Z" } }, files: [{ filename: "a.ts", status: "modified" }] }
            : { default_branch: "main" };
      return new Response(JSON.stringify(body), { status: 200, headers });
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  it("reads the latest commits when there is room", async () => {
    vi.stubGlobal("fetch", fakeGitHub(60));
    const { snapshot, rateLimitReset } = await fetchSnapshot("o", "r");
    expect(snapshot.commitsScanned).toBe(25);
    expect(snapshot.files[0].edits).toBe(25);
    expect(rateLimitReset).toBeUndefined();
  });

  it("draws the city with fewer commits when the limit is close", async () => {
    vi.stubGlobal("fetch", fakeGitHub(14));
    const { snapshot, rateLimitReset } = await fetchSnapshot("o", "r");
    expect(snapshot.commitsScanned).toBeGreaterThan(0);
    expect(snapshot.commitsScanned).toBeLessThan(25);
    expect(snapshot.partialHistory).toBe(true);
    expect(rateLimitReset).toEqual(new Date(2000000000 * 1000));
  });

  it("throws a RateLimitError when nothing is left", async () => {
    vi.stubGlobal("fetch", fakeGitHub(0));
    await expect(fetchSnapshot("o", "r")).rejects.toBeInstanceOf(RateLimitError);
  });
});
