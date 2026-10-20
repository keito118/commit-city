import { CityView } from "./city";
import { COMMIT_LIMIT, RateLimitError, fetchSnapshot, parseRepo } from "./github";
import type { CitySnapshot } from "./history";
import { layoutCity, type Building, type GroundScale } from "./layout";
import type { BuildingKind } from "./languages";
import { THEMES, themeById } from "./themes";

/** Above this many files the city gets too heavy for most laptops. */
const MAX_FILES = 40000;
const TOKEN_KEY = "commit-city:token";
/** Cities fetched from the API are kept this long per tab, so a reload costs no requests. */
const CACHE_MINUTES = 30;

/** Cities scanned ahead of time (`npm run scan`) and shipped with the site. They cost no API requests. */
const EXAMPLES = [
  { id: "vite", label: "vite" },
  { id: "express", label: "express" },
];

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
const tokenDetails = $<HTMLDetailsElement>("token-details");
const examples = $<HTMLElement>("examples");

const params = new URLSearchParams(location.search);
let theme = themeById(params.get("theme"));
let groundScale: GroundScale = params.get("ground") === "linear" ? "linear" : "sqrt";
let current: CitySnapshot | null = null;
let currentExample: string | null = null;
let lastNotes: string[] = [];

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
  if (current) show(current, currentExample, lastNotes);
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

examples.append(
  "Try: ",
  ...EXAMPLES.flatMap((example, i) => {
    const link = document.createElement("a");
    link.href = `?example=${example.id}`;
    link.textContent = example.label;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void buildFromExample(example.id);
    });
    return i === 0 ? [link] : [" · ", link];
  }),
);

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
  if (currentExample) next.set("example", currentExample);
  else if (current?.repo) next.set("repo", current.repo);
  if (theme.id !== THEMES[0].id) next.set("theme", theme.id);
  if (groundScale !== "sqrt") next.set("ground", groundScale);
  const query = next.toString();
  history.replaceState(null, "", query ? `?${query}` : location.pathname);
}

function formatTime(date: Date | null | undefined): string {
  return date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "within the hour";
}

function cacheKey(repo: string, withToken: boolean) {
  return `commit-city:cache:${repo.toLowerCase()}:${withToken ? "token" : "anonymous"}`;
}

function readCache(key: string): CitySnapshot | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) ?? "null") as { time: number; snapshot: CitySnapshot } | null;
    return cached && Date.now() - cached.time < CACHE_MINUTES * 60_000 ? cached.snapshot : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, snapshot: CitySnapshot) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ time: Date.now(), snapshot }));
  } catch {
    // Too big or storage blocked: the next load just asks GitHub again.
  }
}

async function buildFromGitHub(raw: string) {
  const repo = parseRepo(raw);
  if (!repo) {
    setStatus("Enter a repository as owner/repo or a GitHub URL.", true);
    return;
  }
  const fullName = `${repo.owner}/${repo.name}`;
  const token = tokenInput.value.trim() || undefined;
  input.value = fullName;
  showInfo(null);

  const key = cacheKey(fullName, token !== undefined);
  const cached = readCache(key);
  if (cached) {
    show(cached, null, ["loaded from this tab's cache, no API requests used"]);
    return;
  }

  setStatus(`Fetching ${fullName}…`);
  try {
    const { snapshot, rateLimitReset } = await fetchSnapshot(repo.owner, repo.name, { token, onProgress: setStatus });
    writeCache(key, snapshot);
    const notes: string[] = [];
    if (rateLimitReset !== undefined) {
      notes.push(
        (snapshot.commitsScanned
          ? `GitHub's request limit ran out after ${snapshot.commitsScanned} commits, so heights are partial`
          : "GitHub's request limit ran out before any commits, so every building has the same height") +
          `; it resets at ${formatTime(rateLimitReset)}${token ? "" : ", and a token raises the limit"}`,
      );
    } else if (snapshot.partialHistory) {
      notes.push(
        `heights count only the latest ${snapshot.commitsScanned} commits; ` +
          `${token ? "" : `add a token (up to ${COMMIT_LIMIT.withToken}) or `}use \`npm run scan\` for the full history`,
      );
    }
    show(snapshot, null, notes);
  } catch (error) {
    if (error instanceof RateLimitError) {
      tokenDetails.open = !token;
      setStatus(
        `GitHub's request limit is used up until ${formatTime(error.resetAt)}. ` +
          (token
            ? "Try again then, or open one of the examples."
            : "Add a GitHub token below (5,000 requests an hour), or open one of the examples, which need no requests."),
        true,
      );
      return;
    }
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function parseSnapshot(text: string): CitySnapshot {
  const snapshot = JSON.parse(text) as CitySnapshot;
  if (snapshot.format !== "commit-city/1" || !Array.isArray(snapshot.files)) {
    throw new Error("That file isn't a commit-city snapshot. Make one with `npm run scan`.");
  }
  return snapshot;
}

function scannedNote(snapshot: CitySnapshot): string[] {
  return snapshot.scannedAt
    ? [`full history as of ${new Date(snapshot.scannedAt).toLocaleDateString()}`]
    : [];
}

async function buildFromFile(file: File) {
  showInfo(null);
  try {
    const snapshot = parseSnapshot(await file.text());
    input.value = snapshot.repo ?? "";
    show(snapshot, null, scannedNote(snapshot));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function buildFromExample(id: string) {
  const example = EXAMPLES.find((e) => e.id === id);
  if (!example) {
    setStatus(`There is no example called "${id}".`, true);
    return;
  }
  showInfo(null);
  setStatus(`Loading ${example.label}…`);
  try {
    const res = await fetch(`./examples/${example.id}.city.json`);
    if (!res.ok) throw new Error(`Couldn't load the ${example.label} example (${res.status}).`);
    const snapshot = parseSnapshot(await res.text());
    input.value = snapshot.repo ?? "";
    show(snapshot, example.id, scannedNote(snapshot));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function show(snapshot: CitySnapshot, exampleId: string | null, notes: string[]) {
  let files = snapshot.files;
  if (files.length > MAX_FILES) {
    files = files.slice(0, MAX_FILES);
    notes = [...notes, `showing the first ${MAX_FILES.toLocaleString()} files`];
  }
  const layout = layoutCity(files, groundScale);
  view.show(layout);
  current = snapshot;
  currentExample = exampleId;
  lastNotes = notes;
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
const initialExample = params.get("example");
const initialRepo = params.get("repo");
if (initialExample) {
  void buildFromExample(initialExample);
} else if (initialRepo) {
  void buildFromGitHub(initialRepo);
} else {
  void buildFromExample(EXAMPLES[0].id);
}
