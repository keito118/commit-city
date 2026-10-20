import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { RepoFile } from "./github";
import { languageOf, type LanguageGroup } from "./languages";

export interface Building {
  path: string;
  size: number;
  language: LanguageGroup;
  /** Center on the ground plane, and footprint. */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
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
}

interface Node {
  name: string;
  path: string;
  size: number;
  children?: Node[];
}

/** Turns flat file paths into a folder tree. */
export function buildTree(files: RepoFile[]): Node {
  const root: Node = { name: "", path: "", size: 0, children: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let child = node.children!.find((c) => c.children && c.name === parts[i]);
      if (!child) {
        child = { name: parts[i], path, size: 0, children: [] };
        node.children!.push(child);
      }
      node = child;
    }
    node.children!.push({ name: parts[parts.length - 1], path: file.path, size: file.size });
  }
  return root;
}

/** Building height in world units. Logarithmic, so one huge bundle doesn't dwarf the whole city. */
export function heightFor(size: number): number {
  return 1 + 8 * Math.log2(1 + size / 1000);
}

/** Ground area a file gets. Grows much slower than size, so the city reads by height, not by footprint. */
export function areaFor(size: number): number {
  return 20 + Math.sqrt(size);
}

const EXTENT = 400;

export function layoutCity(files: RepoFile[]): CityLayout {
  const root = hierarchy(buildTree(files))
    .sum((d) => (d.children ? 0 : areaFor(d.size)))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const laidOut = treemap<Node>()
    .tile(treemapSquarify)
    .size([EXTENT, EXTENT])
    .paddingInner(1.2)
    .paddingOuter((n) => (n.depth === 0 ? 0 : 1.5))
    .round(false)(root);

  const buildings: Building[] = [];
  const districts: District[] = [];
  const half = EXTENT / 2;

  for (const node of laidOut.descendants()) {
    const width = node.x1 - node.x0;
    const length = node.y1 - node.y0;
    const x = node.x0 + width / 2 - half;
    const z = node.y0 + length / 2 - half;
    if (node.data.children) {
      if (node.depth > 0) districts.push({ path: node.data.path, depth: node.depth, x, z, width, length });
      continue;
    }
    // Leave a little gap so neighbouring buildings read as separate blocks.
    const gap = Math.min(width, length) * 0.12;
    buildings.push({
      path: node.data.path,
      size: node.data.size,
      language: languageOf(node.data.path),
      x,
      z,
      width: Math.max(width - gap, 0.05),
      depth: Math.max(length - gap, 0.05),
      height: heightFor(node.data.size),
    });
  }
  return { buildings, districts, extent: EXTENT };
}
