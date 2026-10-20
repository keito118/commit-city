export interface RepoFile {
  path: string;
  size: number;
}

export interface RepoSnapshot {
  owner: string;
  name: string;
  branch: string;
  files: RepoFile[];
  truncated: boolean;
}

const API = "https://api.github.com";

/** Accepts "owner/name" or a github.com URL. Returns null when it can't tell. */
export function parseRepo(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match =
    trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/) ??
    trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404) throw new Error("Repository not found (or it is private).");
  if (res.status === 403 || res.status === 429) {
    throw new Error("GitHub API rate limit reached. Try again in a while.");
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchSnapshot(owner: string, name: string): Promise<RepoSnapshot> {
  const repo = await getJson<{ default_branch: string }>(`${API}/repos/${owner}/${name}`);
  const branch = repo.default_branch;
  const tree = await getJson<{
    tree: { path: string; type: string; size?: number }[];
    truncated: boolean;
  }>(`${API}/repos/${owner}/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`);

  const files = tree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));
  return { owner, name, branch, files, truncated: tree.truncated };
}
