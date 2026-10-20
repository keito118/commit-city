import { CityView } from "./city";
import { fetchSnapshot, parseRepo } from "./github";
import { layoutCity, type Building } from "./layout";
import type { LanguageGroup } from "./languages";
import { THEMES, themeById } from "./themes";

/** Above this many files the city gets too heavy for most laptops. */
const MAX_FILES = 40000;

const LANGUAGE_LABELS: Record<LanguageGroup, string> = {
  script: "JS / TS",
  python: "Python",
  systems: "C / C++ / Rust / Go",
  jvm: "Java / Kotlin",
  web: "Web / Ruby / PHP",
  shell: "Shell",
  data: "Data / config",
  docs: "Docs",
  media: "Media",
  other: "Other",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("repo-form");
const input = $<HTMLInputElement>("repo-input");
const themeSelect = $<HTMLSelectElement>("theme-select");
const status = $<HTMLParagraphElement>("status");
const info = $<HTMLElement>("info");
const legend = $<HTMLElement>("legend");

const params = new URLSearchParams(location.search);
let theme = themeById(params.get("theme"));
let current: { owner: string; name: string; branch: string } | null = null;

const view = new CityView($("city"), theme);

for (const t of THEMES) themeSelect.add(new Option(t.label, t.id, false, t.id === theme.id));
themeSelect.addEventListener("change", () => {
  theme = themeById(themeSelect.value);
  view.setTheme(theme);
  renderLegend();
  updateUrl();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void build(input.value);
});

// Treat a click as a selection only when the camera didn't move (dragging rotates the city).
let downAt: { x: number; y: number } | null = null;
const canvasHost = $("city");
canvasHost.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvasHost.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
  const building = view.pick(e.clientX, e.clientY);
  view.select(building);
  showInfo(building);
});

function setStatus(text: string, isError = false) {
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function updateUrl() {
  const next = new URLSearchParams();
  if (current) next.set("repo", `${current.owner}/${current.name}`);
  if (theme.id !== THEMES[0].id) next.set("theme", theme.id);
  const query = next.toString();
  history.replaceState(null, "", query ? `?${query}` : location.pathname);
}

async function build(raw: string) {
  const repo = parseRepo(raw);
  if (!repo) {
    setStatus("Enter a repository as owner/repo or a GitHub URL.", true);
    return;
  }
  input.value = `${repo.owner}/${repo.name}`;
  setStatus(`Fetching ${repo.owner}/${repo.name}…`);
  showInfo(null);
  try {
    const snapshot = await fetchSnapshot(repo.owner, repo.name);
    let files = snapshot.files;
    const notes: string[] = [];
    if (snapshot.truncated) notes.push("GitHub returned only part of the tree");
    if (files.length > MAX_FILES) {
      files = files.slice(0, MAX_FILES);
      notes.push(`showing the first ${MAX_FILES.toLocaleString()} files`);
    }
    const layout = layoutCity(files);
    view.show(layout);
    current = { owner: snapshot.owner, name: snapshot.name, branch: snapshot.branch };
    updateUrl();
    const folders = layout.districts.length;
    setStatus(
      `${snapshot.owner}/${snapshot.name}@${snapshot.branch}: ${files.length.toLocaleString()} files in ` +
        `${folders.toLocaleString()} folders` +
        (notes.length ? ` (${notes.join("; ")})` : "") +
        ". Drag to look around, click a building.",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function showInfo(building: Building | null) {
  info.hidden = building === null;
  if (!building || !current) return;
  const url = `https://github.com/${current.owner}/${current.name}/blob/${encodeURIComponent(current.branch)}/${building.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  info.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = building.path.split("/").pop() ?? building.path;
  const list = document.createElement("dl");
  for (const [term, value] of [
    ["Path", building.path],
    ["Size", formatBytes(building.size)],
    ["Kind", LANGUAGE_LABELS[building.language]],
  ]) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open on GitHub";
  info.append(title, list, link);
}

function renderLegend() {
  legend.replaceChildren(
    ...(Object.keys(LANGUAGE_LABELS) as LanguageGroup[]).map((group) => {
      const item = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.style.background = theme.buildings[group];
      item.append(swatch, LANGUAGE_LABELS[group]);
      return item;
    }),
  );
}

renderLegend();
const initial = params.get("repo");
if (initial) {
  void build(initial);
} else {
  setStatus("Enter a public GitHub repository to build its city.");
}
