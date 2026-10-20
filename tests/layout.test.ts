import { describe, expect, it } from "vitest";
import { buildTree, floorsFor, layoutCity, FLOOR_HEIGHT } from "../src/layout";
import { buildingKindOf, languageOf } from "../src/languages";

const file = (path: string, size: number, edits: number) => ({ path, size, edits });
const files = [
  file("README.md", 2000, 40),
  file("src/main.ts", 8000, 120),
  file("src/util/math.ts", 500, 3),
  file("tests/main.test.ts", 1200, 10),
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
  const byPath = (path: string) => layout.buildings.find((b) => b.file.path === path)!;

  it("makes one building per file and one district per folder", () => {
    expect(layout.buildings).toHaveLength(4);
    expect(layout.districts.map((d) => d.path).sort()).toEqual(["src", "src/util", "tests"]);
  });

  it("keeps every building inside the city", () => {
    const half = layout.extent / 2;
    for (const b of layout.buildings) {
      expect(Math.abs(b.x) + b.width / 2).toBeLessThanOrEqual(half + 1e-9);
      expect(Math.abs(b.z) + b.depth / 2).toBeLessThanOrEqual(half + 1e-9);
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

  it("makes more-edited files taller", () => {
    expect(byPath("src/main.ts").height).toBeGreaterThan(byPath("README.md").height);
    expect(byPath("README.md").height).toBeGreaterThan(byPath("src/util/math.ts").height);
    expect(byPath("src/main.ts").height).toBe(floorsFor(120) * FLOOR_HEIGHT);
  });

  it("gives bigger files more ground, in proportion to their share", () => {
    const main = byPath("src/main.ts");
    const readme = byPath("README.md");
    expect(main.share).toBeCloseTo(8000 / 11700);
    expect(main.width * main.depth).toBeGreaterThan(readme.width * readme.depth * 2);
  });

  it("uses the exact share of the repository with the linear ground scale", () => {
    const linear = layoutCity(files, "linear");
    const area = (path: string) => {
      const b = linear.buildings.find((x) => x.file.path === path)!;
      return b.width * b.depth;
    };
    // 8000 vs 2000 bytes: about 4x the ground (streets and padding take a little off).
    expect(area("src/main.ts") / area("README.md")).toBeGreaterThan(3);
  });

  it("stands nested files on their folder's plate", () => {
    expect(byPath("README.md").base).toBe(0);
    expect(byPath("src/util/math.ts").base).toBeGreaterThan(byPath("src/main.ts").base);
  });

  it("handles an empty repository", () => {
    expect(layoutCity([]).buildings).toEqual([]);
  });
});

describe("floorsFor", () => {
  it("grows slowly with edits", () => {
    expect(floorsFor(0)).toBe(1);
    expect(floorsFor(1)).toBe(3);
    expect(floorsFor(1000)).toBeLessThan(30);
  });
});

describe("languageOf and buildingKindOf", () => {
  it("groups by extension", () => {
    expect(languageOf("src/app.tsx")).toBe("script");
    expect(languageOf("pkg/main.go")).toBe("systems");
    expect(languageOf("docs/README.MD")).toBe("docs");
    expect(languageOf("Makefile")).toBe("other");
    expect(languageOf(".gitignore")).toBe("other");
  });

  it("turns file kinds into building kinds", () => {
    expect(buildingKindOf("src/app.ts")).toBe("office");
    expect(buildingKindOf("src/lib.rs")).toBe("tower");
    expect(buildingKindOf("README.md")).toBe("house");
    expect(buildingKindOf("package.json")).toBe("warehouse");
    expect(buildingKindOf("logo.png")).toBe("hall");
    expect(buildingKindOf("LICENSE")).toBe("shed");
  });
});
