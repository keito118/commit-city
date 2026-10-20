import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { RepoFile } from "./history";
import { buildingKindOf, languageOf, type BuildingKind, type LanguageGroup } from "./languages";

export interface Building {
  file: RepoFile;
  language: LanguageGroup;
  kind: BuildingKind;
  /** Share of the repository's total size, 0..1. */
  share: number;
  floors: number;
  /** Center on the ground plane, footprint, height, and the height of the plate it stands on. */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  base: number;
  /** Stable per-file number, used to vary colors. */
  seed: number;
}

export interface District {
  path: string;
  depth: number;
  x: number;
  z: number;
  width: number;
  length: number;
}

export interface CityLayout {
  buildings: Building[];
  districts: District[];
  /** Side length of the square city. */
  extent: number;
  tallest: number;
}

interface Node {
  name: string;
  path: string;
  file?: RepoFile;
  children?: Node[];
}

/** World units per floor. */
export const FLOOR_HEIGHT = 3.2;
/** Thickness of one district plate; nested folders stack. */
export const PLATE_HEIGHT = 0.3;
/** Average ground per file, so building scale stays the same for small and huge repositories. */
const GROUND_PER_FILE = 18 * 18;

/** Turns flat file paths into a folder tree. */
export function buildTree(files: RepoFile[]): Node {
  const root: Node = { name: "", path: "", children: [] };
  const folders = new Map<string, Node>([["", root]]);
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let child = folders.get(path);
      if (!child) {
        child = { name: parts[i], path, children: [] };
        node.children!.push(child);
        folders.set(path, child);
      }
      node = child;
    }
    node.children!.push({ name: parts[parts.length - 1], path: file.path, file });
  }
  return root;
}

/** Floors grow with edits, logarithmically: 1 edit = 3 floors, 10 = 9, 100 = 17, 1000 = 25. */
export function floorsFor(edits: number): number {
  return 1 + Math.round(2.4 * Math.log2(1 + edits));
}

export function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Street width between siblings: avenues between top-level folders, alleys deep inside. */
function streetWidth(depth: number): number {
  return depth === 0 ? 7 : depth === 1 ? 4 : 2.5;
}

/**
 * How ground follows size. "linear" is the plain share of the repository; "sqrt"
 * keeps the order but tames a few huge files (images, lockfiles) that would
 * otherwise turn half the city into empty lots.
 */
export type GroundScale = "linear" | "sqrt";

export function layoutCity(files: RepoFile[], groundScale: GroundScale = "sqrt"): CityLayout {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const weightOf = (size: number) => (groundScale === "sqrt" ? Math.sqrt(size) : size);
  const totalWeight = files.reduce((sum, f) => sum + weightOf(f.size), 0);
  // Tiny files still get a lot, so they stay visible.
  const minWeight = files.length ? (totalWeight / files.length) * 0.15 || 1 : 1;
  const extent = Math.max(120, Math.sqrt(files.length * GROUND_PER_FILE));

  const root = hierarchy(buildTree(files))
    .sum((d) => (d.file ? Math.max(weightOf(d.file.size), minWeight) : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const laidOut = treemap<Node>()
    .tile(treemapSquarify)
    .size([extent, extent])
    .paddingInner((n) => streetWidth(n.depth))
    .paddingOuter((n) => (n.depth === 0 ? 0 : 1.2))
    .round(false)(root);

  const buildings: Building[] = [];
  const districts: District[] = [];
  const half = extent / 2;
  let tallest = 0;

  for (const node of laidOut.descendants()) {
    const width = Math.max(node.x1 - node.x0, 0);
    const length = Math.max(node.y1 - node.y0, 0);
    const x = node.x0 + width / 2 - half;
    const z = node.y0 + length / 2 - half;
    const file = node.data.file;
    if (!file) {
      if (node.depth > 0) districts.push({ path: node.data.path, depth: node.depth, x, z, width, length });
      continue;
    }
    const floors = floorsFor(file.edits);
    const height = floors * FLOOR_HEIGHT;
    tallest = Math.max(tallest, height);
    buildings.push({
      file,
      language: languageOf(file.path),
      kind: buildingKindOf(file.path),
      share: total ? file.size / total : 0,
      floors,
      x,
      z,
      width: Math.max(width, 0.4),
      depth: Math.max(length, 0.4),
      height,
      base: (node.depth - 1) * PLATE_HEIGHT,
      seed: seedOf(file.path),
    });
  }
  return { buildings, districts, extent, tallest };
}
