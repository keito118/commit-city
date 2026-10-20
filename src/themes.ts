import type { BuildingKind } from "./languages";

/**
 * A theme is the city's "skin". Layout and data never depend on it, so new
 * looks (Japanese streets, European old town, ...) only need a new entry here.
 */
export interface Theme {
  id: string;
  label: string;
  sky: string;
  /** Grass around the city. */
  ground: string;
  /** Asphalt: the streets between districts. */
  road: string;
  /** District plates (sidewalks), from the outermost folder inwards. */
  plates: string[];
  sun: { color: string; intensity: number; elevation: number };
  ambient: { sky: string; ground: string; intensity: number };
  /** Wall and roof colors per building kind. Each building picks one of each. */
  kinds: Record<BuildingKind, { walls: string[]; roofs: string[] }>;
  windows: {
    /** Unlit glass. */
    glass: string;
    /** Lit windows pick one of these two. */
    lit: [string, string];
    /** Share of windows that are lit, 0..1. */
    litShare: number;
    /** How bright lit windows glow (0 = daytime, no glow). */
    glow: number;
  };
  shadows: boolean;
  /** Overall brightness after tone mapping. */
  exposure: number;
}

export const THEMES: Theme[] = [
  {
    id: "daylight",
    label: "Daylight",
    sky: "#bcd6ea",
    ground: "#8fa577",
    road: "#55585c",
    plates: ["#b9b6ae", "#c4c1b9", "#cfccc4", "#d8d5ce"],
    sun: { color: "#fff4e0", intensity: 2.4, elevation: 0.9 },
    ambient: { sky: "#dbe8f5", ground: "#7d7466", intensity: 1.3 },
    kinds: {
      tower: { walls: ["#6b8496", "#5d7686", "#7891a1", "#56707f", "#8398a4"], roofs: ["#3f4449", "#4a4f54"] },
      office: { walls: ["#cfc8bb", "#bdb6aa", "#ddd6c8", "#aca598", "#c9bca5", "#a39f98"], roofs: ["#5d6063", "#6c6f71"] },
      house: { walls: ["#f0e8d9", "#e6dccb", "#d9ccb6", "#f3f0ea", "#d2c7b4"], roofs: ["#9c4a35", "#7f3b2c", "#585d64", "#474c54", "#8a5a3c"] },
      warehouse: { walls: ["#a9aca9", "#9ca5a8", "#b7b2a6", "#8f9597"], roofs: ["#6e7376", "#7d8183"] },
      hall: { walls: ["#9d5c46", "#8b4c3b", "#a9684e", "#7e4b3d"], roofs: ["#4f5053", "#5c5d60"] },
      shed: { walls: ["#bfb8ac", "#aaa59b", "#c7c2b8"], roofs: ["#6a6a6a", "#5a5a5a"] },
    },
    windows: { glass: "#34495c", lit: ["#ffe2a8", "#fff4d6"], litShare: 0, glow: 0 },
    shadows: true,
    exposure: 1,
  },
  {
    id: "dusk",
    label: "Dusk",
    sky: "#e7a37c",
    ground: "#5f6b4c",
    road: "#3d3d42",
    plates: ["#8d8580", "#968f89", "#a09892", "#a9a19b"],
    sun: { color: "#ffb37a", intensity: 1.6, elevation: 0.25 },
    ambient: { sky: "#f0c0a8", ground: "#5a4a50", intensity: 1.4 },
    kinds: {
      tower: { walls: ["#5b6a78", "#4e5d6a", "#687786"], roofs: ["#2f3236", "#383b40"] },
      office: { walls: ["#b9ab9c", "#a89c8f", "#c4b6a5", "#9a8f85"], roofs: ["#4b4c4f", "#57585a"] },
      house: { walls: ["#e1cdb6", "#d6c1aa", "#cbb59e"], roofs: ["#843d2e", "#6d3327", "#4b4f57"] },
      warehouse: { walls: ["#8f8f8c", "#848a8c", "#9a958a"], roofs: ["#5a5e61"] },
      hall: { walls: ["#8a4f3d", "#7a4234", "#94593f"], roofs: ["#3f4043"] },
      shed: { walls: ["#a39b90", "#958f86"], roofs: ["#555555"] },
    },
    windows: { glass: "#3a3f4a", lit: ["#ffcf7a", "#ffe6b3"], litShare: 0.45, glow: 1.1 },
    shadows: true,
    exposure: 1.15,
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    sky: "#07040f",
    ground: "#0b0a12",
    road: "#121019",
    plates: ["#1a1626", "#201b30", "#26203a", "#2c2544"],
    sun: { color: "#8a6cff", intensity: 0.9, elevation: 0.7 },
    ambient: { sky: "#5a46a0", ground: "#1a1030", intensity: 1.3 },
    kinds: {
      tower: { walls: ["#2c3148", "#343a56", "#262b40"], roofs: ["#16182a"] },
      office: { walls: ["#36324a", "#2e2b40", "#3d3854"], roofs: ["#1a1824"] },
      house: { walls: ["#3a3248", "#332c40"], roofs: ["#5a1f4a", "#1f3558"] },
      warehouse: { walls: ["#2e3340", "#363c4a"], roofs: ["#1a1d26"] },
      hall: { walls: ["#46304a", "#3c2840"], roofs: ["#1c1622"] },
      shed: { walls: ["#33333f"], roofs: ["#1a1a22"] },
    },
    windows: { glass: "#0d0f18", lit: ["#ff3fd4", "#3fd4ff"], litShare: 0.55, glow: 1.6 },
    shadows: false,
    exposure: 2.2,
  },
];

export function themeById(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
