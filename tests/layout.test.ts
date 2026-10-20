import { describe, expect, it } from "vitest";
import { buildTree, heightFor, layoutCity } from "../src/layout";
import { languageOf } from "../src/languages";

const files = [
  { path: "README.md", size: 2000 },
  { path: "src/main.ts", size: 8000 },
  { path: "src/util/math.ts", size: 500 },
  { path: "tests/main.test.ts", size: 1200 },
];

describe("buildTree", () => {
  it("nests files under their folders", () => {
    const root = buildTree(files);
    const src = root.children!.find((c) => c.name === "src")!;
    expect(src.children!.map((c) => c.name).sort()).toEqual(["main.ts", "util"]);
    expect(src.children!.find((c) => c.name === "util")!.children![0].path).toBe("src/util/math.ts");
  });
});

describe("layoutCity", () => {
  const layout = layoutCity(files);

  it("makes one building per file and one district per folder", () => {
    expect(layout.buildings).toHaveLength(4);
    expect(layout.districts.map((d) => d.path).sort()).toEqual(["src", "src/util", "tests"]);
  });

  it("keeps every building inside the city", () => {
    const half = layout.extent / 2;
    for (const b of layout.buildings) {
      expect(Math.abs(b.x) + b.width / 2).toBeLessThanOrEqual(half);
      expect(Math.abs(b.z) + b.depth / 2).toBeLessThanOrEqual(half);
    }
  });

  it("does not overlap buildings", () => {
    const bs = layout.buildings;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2;
        const overlapZ = Math.abs(a.z - b.z) < (a.depth + b.depth) / 2;
        expect(overlapX && overlapZ).toBe(false);
      }
    }
  });

  it("makes bigger files taller", () => {
    const main = layout.buildings.find((b) => b.path === "src/main.ts")!;
    const math = layout.buildings.find((b) => b.path === "src/util/math.ts")!;
    expect(main.height).toBeGreaterThan(math.height);
    expect(heightFor(0)).toBeGreaterThan(0);
  });

  it("handles an empty repository", () => {
    expect(layoutCity([]).buildings).toEqual([]);
  });
});

describe("languageOf", () => {
  it("groups by extension", () => {
    expect(languageOf("src/app.tsx")).toBe("script");
    expect(languageOf("pkg/main.go")).toBe("systems");
    expect(languageOf("docs/README.MD")).toBe("docs");
    expect(languageOf("Makefile")).toBe("other");
    expect(languageOf(".gitignore")).toBe("other");
  });
});
