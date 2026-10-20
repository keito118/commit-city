import { describe, expect, it } from "vitest";
import { countEdits } from "../src/history";

describe("countEdits", () => {
  it("counts commits per file", () => {
    const edits = countEdits(
      [
        { time: 30, changes: [{ status: "M", path: "a.ts" }] },
        { time: 20, changes: [{ status: "M", path: "a.ts" }, { status: "M", path: "b.ts" }] },
        { time: 10, changes: [{ status: "A", path: "a.ts" }, { status: "A", path: "b.ts" }] },
      ],
      ["a.ts", "b.ts"],
    );
    expect(edits.get("a.ts")).toEqual({ edits: 3, lastEdited: 30 });
    expect(edits.get("b.ts")).toEqual({ edits: 2, lastEdited: 20 });
  });

  it("follows renames back in time", () => {
    const edits = countEdits(
      [
        { time: 30, changes: [{ status: "M", path: "src/new.ts" }] },
        { time: 20, changes: [{ status: "R", from: "old.ts", path: "src/new.ts" }] },
        { time: 10, changes: [{ status: "M", path: "old.ts" }] },
        { time: 5, changes: [{ status: "A", path: "old.ts" }] },
      ],
      ["src/new.ts"],
    );
    expect(edits.get("src/new.ts")!.edits).toBe(4);
  });

  it("ignores files that no longer exist", () => {
    const edits = countEdits([{ time: 1, changes: [{ status: "D", path: "gone.ts" }] }], ["kept.ts"]);
    expect([...edits.keys()]).toEqual(["kept.ts"]);
    expect(edits.get("kept.ts")!.edits).toBe(0);
  });
});
