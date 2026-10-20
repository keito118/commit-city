import { describe, expect, it } from "vitest";
import { parseRepo } from "../src/github";

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
