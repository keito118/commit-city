import type { LanguageGroup } from "./languages";

/**
 * A theme is the city's "skin". Layout and data never depend on it, so new
 * looks (Japanese streets, European old town, ...) only need a new entry here.
 */
export interface Theme {
  id: string;
  label: string;
  sky: string;
  fog: string;
  ground: string;
  /** District plates, from the outermost folder inwards. */
  districts: string[];
  buildings: Record<LanguageGroup, string>;
  /** Extra glow on buildings (0 = none). */
  emissive: number;
  ambient: number;
  sun: number;
}

export const THEMES: Theme[] = [
  {
    id: "daylight",
    label: "Daylight",
    sky: "#cfe3f2",
    fog: "#cfe3f2",
    ground: "#a7b39a",
    districts: ["#c9c6bd", "#bdb9ae", "#b1ada1", "#a6a295"],
    buildings: {
      script: "#e8c25a",
      python: "#4f7fbf",
      systems: "#b5654a",
      jvm: "#c9874a",
      web: "#d97a8c",
      shell: "#6aa36f",
      data: "#9aa3ad",
      docs: "#f2efe6",
      media: "#a58bc7",
      other: "#8a8f96",
    },
    emissive: 0,
    ambient: 0.7,
    sun: 1.6,
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    sky: "#07040f",
    fog: "#120a24",
    ground: "#0b0a14",
    districts: ["#1a1430", "#221a3d", "#2a204a", "#332757"],
    buildings: {
      script: "#ffd23f",
      python: "#3fa9ff",
      systems: "#ff3f6c",
      jvm: "#ff8a3f",
      web: "#ff3fd4",
      shell: "#3fff9b",
      data: "#7a7fff",
      docs: "#d6f6ff",
      media: "#b23fff",
      other: "#5c6a80",
    },
    emissive: 0.22,
    ambient: 0.25,
    sun: 0.6,
  },
];

export function themeById(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
