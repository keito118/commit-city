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

/** Real-world facade and roof colors, shared by the daytime themes. */
const CITY_COLORS: Theme["kinds"] = {
  tower: {
    walls: ["#5b87a8", "#4d7c8a", "#6f9fb8", "#3f6f7f", "#7a9a78", "#9a8463", "#5e6f9a", "#86a9c4"],
    roofs: ["#d9dcde", "#9aa3a8", "#6f8f72", "#c9b28a", "#7c8a99"],
  },
  office: {
    walls: [
      "#e8d9b5", "#d98f6a", "#c9785c", "#e6c48a", "#a9c2a0", "#9fb8cc",
      "#e3a99a", "#f0ece2", "#b7a6c9", "#c2b280", "#d4b8a0", "#8fb3a8",
    ],
    roofs: ["#e8e6e1", "#b8bcbf", "#7fa36b", "#c96f4a", "#5f8a9a", "#8a8f94", "#d8c9a8"],
  },
  house: {
    walls: ["#f6e7c1", "#f2c6a0", "#e8a87c", "#c9d9b0", "#bcd4e6", "#f4f1ea", "#e9c9d3", "#d9b38c"],
    roofs: ["#b5523b", "#8f3e2c", "#4b6a8a", "#3f5e4a", "#6b4a3a", "#a8452f", "#c7743f"],
  },
  warehouse: {
    walls: ["#c9cfd2", "#9fb3bf", "#c7b98f", "#8fa6a0", "#b9a58e", "#d6d0c4", "#a7b9d1"],
    roofs: ["#a6adb2", "#7b8d99", "#b5bdc1", "#8fa38a"],
  },
  hall: {
    walls: ["#b5603f", "#a14f38", "#c4744f", "#8f4a3a", "#c98a5a"],
    roofs: ["#2f4f4f", "#5a6e6a", "#7d5a46", "#4f6d7a"],
  },
  shed: {
    walls: ["#d8cbb0", "#b9c4a8", "#c8b6a0", "#a8b8c8", "#d9a98a"],
    roofs: ["#8a8a8a", "#6f7f6a", "#9a6a52"],
  },
};

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
    kinds: CITY_COLORS,
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
    kinds: CITY_COLORS,
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
