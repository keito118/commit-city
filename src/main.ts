import { CityView } from "./city";
import { COMMIT_LIMIT, fetchSnapshot, parseRepo } from "./github";
import type { CitySnapshot } from "./history";
import { layoutCity, type Building, type GroundScale } from "./layout";
import type { BuildingKind } from "./languages";
import { THEMES, themeById } from "./themes";

/** Above this many files the city gets too heavy for most laptops. */
const MAX_FILES = 40000;
const TOKEN_KEY = "commit-city:token";

const KIND_LABELS: Record<BuildingKind, string> = {
  tower: "Tower: C / C++ / Rust / Go / Java",
  office: "Office: JS / TS / Python / web",
  house: "House: docs",
  warehouse: "Warehouse: data / config",
  hall: "Hall: images / media",
  shed: "Shed: other",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("repo-form");
const input = $<HTMLInputElement>("repo-input");
const tokenInput = $<HTMLInputElement>("token-input");
const fileInput = $<HTMLInputElement>("file-input");
const themeSelect = $<HTMLSelectElement>("theme-select");
const groundSelect = $<HTMLSelectElement>("ground-select");
const status = $<HTMLParagraphElement>("status");
const info = $<HTMLElement>("info");
const legend = $<HTMLElement>("legend");

const params = new URLSearchParams(location.search);
let theme = themeById(params.get("theme"));
let groundScale: GroundScale = params.get("ground") === "linear" ? "linear" : "sqrt";
let current: CitySnapshot | null = null;

const view = new CityView($("city"), theme);

for (const t of THEMES) themeSelect.add(new Option(t.label, t.id, false, t.id === theme.id));
themeSelect.addEventListener("change", () => {
  theme = themeById(themeSelect.value);
  view.setTheme(theme);
  renderLegend();
  updateUrl();
});

groundSelect.value = groundScale;
groundSelect.addEventListener("change", () => {
  groundScale = groundSelect.value === "linear" ? "linear" : "sqrt";
  if (current) show(current);
  updateUrl();
});

tokenInput.value = readToken();
tokenInput.addEventListener("change", () => {
  try {
    if (tokenInput.value.trim()) localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token still works for this visit.
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void buildFromGitHub(input.value);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void buildFromFile(file);
  fileInput.value = "";
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) void buildFromFile(file);
});

// Treat a click as a selection only when the camera didn't move (dragging rotates the city).
let downAt: { x: number; y: number } | null = null;
const canvasHost = $("city");
canvasHost.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvasHost.addEventListener("pointerup", (e) => {
  if (e.button !== 0 || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
  const building = view.pick(e.clientX, e.clientY);
  view.select(building);
  showInfo(building);
});

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function setStatus(text: string, isError = false) {
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function updateUrl() {
  const next = new URLSearchParams();
  if (current?.repo) next.set("repo", current.repo);
  if (theme.id !== THEMES[0].id) next.set("theme", theme.id);
  if (groundScale !== "sqrt") next.set("ground", groundScale);
  const query = next.toString();
  history.replaceState(null, "", query ? `?${query}` : location.pathname);
}

async function buildFromGitHub(raw: string) {
  const repo = parseRepo(raw);
  if (!repo) {
    setStatus("Enter a repository as owner/repo or a GitHub URL.", true);
    return;
  }
  input.value = `${repo.owner}/${repo.name}`;
  setStatus(`Fetching ${repo.owner}/${repo.name}…`);
  showInfo(null);
  try {
    const snapshot = await fetchSnapshot(repo.owner, repo.name, {
      token: tokenInput.value.trim() || undefined,
      onProgress: setStatus,
    });
    show(snapshot);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function buildFromFile(file: File) {
  showInfo(null);
  try {
    const snapshot = JSON.parse(await file.text()) as CitySnapshot;
    if (snapshot.format !== "commit-city/1" || !Array.isArray(snapshot.files)) {
      throw new Error("That file isn't a commit-city snapshot. Make one with `npm run scan`.");
    }
    input.value = snapshot.repo ?? "";
    show(snapshot);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function show(snapshot: CitySnapshot) {
  let files = snapshot.files;
  const notes: string[] = [];
  if (files.length > MAX_FILES) {
    files = files.slice(0, MAX_FILES);
    notes.push(`showing the first ${MAX_FILES.toLocaleString()} files`);
  }
  if (snapshot.partialHistory) {
    notes.push(
      `heights count only the latest ${snapshot.commitsScanned} commits; ` +
        `add a token (up to ${COMMIT_LIMIT.withToken}) or use \`npm run scan\` for the full history`,
    );
  }
  const layout = layoutCity(files, groundScale);
  view.show(layout);
  current = snapshot;
  updateUrl();
  setStatus(
    `${snapshot.name}@${snapshot.branch}: ${files.length.toLocaleString()} files, ` +
      `${snapshot.commitsScanned.toLocaleString()} commits` +
      (notes.length ? ` (${notes.join("; ")})` : "") +
      ". Drag to look around, click a building.",
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatShare(share: number): string {
  const percent = share * 100;
  return percent >= 0.1 ? `${percent.toFixed(1)}%` : "< 0.1%";
}

function showInfo(building: Building | null) {
  info.hidden = building === null;
  if (!building || !current) return;
  const { file } = building;
  info.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = file.path.split("/").pop() ?? file.path;
  const rows: [string, string][] = [
    ["Path", file.path],
    ["Edits", `${file.edits.toLocaleString()} (${building.floors} floors)`],
    ["Size", `${formatBytes(file.size)}, ${formatShare(building.share)} of the repo`],
    ["Building", KIND_LABELS[building.kind]],
  ];
  if (file.lastEdited) rows.push(["Last edit", new Date(file.lastEdited * 1000).toLocaleDateString()]);
  const list = document.createElement("dl");
  for (const [term, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  }
  info.append(title, list);
  if (current.repo) {
    const link = document.createElement("a");
    link.href = `https://github.com/${current.repo}/blob/${encodeURIComponent(current.branch)}/${file.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open on GitHub";
    info.append(link);
  }
}

function renderLegend() {
  legend.replaceChildren(
    ...(Object.keys(KIND_LABELS) as BuildingKind[]).map((kind) => {
      const item = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.style.background = theme.kinds[kind].walls[0];
      item.append(swatch, KIND_LABELS[kind]);
      return item;
    }),
    Object.assign(document.createElement("span"), { textContent: "Height = edits · Ground = file size" }),
  );
}

renderLegend();
const initial = params.get("repo");
if (initial) {
  void buildFromGitHub(initial);
} else {
  setStatus("Enter a GitHub repository, or drop a snapshot made with `npm run scan`.");
}
