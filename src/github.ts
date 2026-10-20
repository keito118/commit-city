import { countEdits, type ChangeStatus, type CitySnapshot, type CommitChanges } from "./history";

const API = "https://api.github.com";

/** How many commits to read for edit counts. Each one costs an API request. */
export const COMMIT_LIMIT = { withToken: 400, withoutToken: 25 };

/** Accepts "owner/name" or a github.com URL. Returns null when it can't tell. */
export function parseRepo(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match =
    trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/) ??
    trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

const STATUS: Record<string, ChangeStatus> = {
  added: "A",
  copied: "A",
  modified: "M",
  changed: "M",
  removed: "D",
  renamed: "R",
};

export async function fetchSnapshot(
  owner: string,
  name: string,
  options: { token?: string; onProgress?: (text: string) => void } = {},
): Promise<CitySnapshot> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`, { headers });
    if (res.status === 401) throw new Error("The GitHub token was rejected.");
    if (res.status === 404) throw new Error("Repository not found (private repositories need a token).");
    if (res.status === 403 || res.status === 429) {
      throw new Error("GitHub API rate limit reached. Add a token, or try again later.");
    }
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  const repoPath = `/repos/${owner}/${name}`;
  const repo = await getJson<{ default_branch: string }>(repoPath);
  const branch = repo.default_branch;
  const tree = await getJson<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
    `${repoPath}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const blobs = tree.tree.filter((entry) => entry.type === "blob");

  // The commit list doesn't say which files changed, so each commit is fetched on its own.
  const limit = options.token ? COMMIT_LIMIT.withToken : COMMIT_LIMIT.withoutToken;
  const shas: string[] = [];
  for (let page = 1; shas.length < limit; page++) {
    const perPage = Math.min(100, limit);
    const list = await getJson<{ sha: string; parents: unknown[] }[]>(
      `${repoPath}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}&page=${page}`,
    );
    shas.push(...list.filter((c) => c.parents.length < 2).map((c) => c.sha));
    if (list.length < perPage) break;
  }
  const reachedEnd = shas.length < limit;
  shas.length = Math.min(shas.length, limit);

  const commits: CommitChanges[] = new Array(shas.length);
  let done = 0;
  await runPool(shas, 8, async (sha, i) => {
    const detail = await getJson<{
      commit: { author: { date: string } };
      files?: { filename: string; status: string; previous_filename?: string }[];
    }>(`${repoPath}/commits/${sha}`);
    commits[i] = {
      time: Math.floor(Date.parse(detail.commit.author.date) / 1000),
      changes: (detail.files ?? []).map((f) => ({
        status: STATUS[f.status] ?? "M",
        path: f.filename,
        from: f.previous_filename,
      })),
    };
    options.onProgress?.(`Reading commits… ${++done}/${shas.length}`);
  });

  const edits = countEdits(commits, blobs.map((b) => b.path));
  return {
    format: "commit-city/1",
    repo: `${owner}/${name}`,
    name: `${owner}/${name}`,
    branch,
    files: blobs.map((b) => ({ path: b.path, size: b.size ?? 0, ...edits.get(b.path)! })),
    commitsScanned: commits.length,
    partialHistory: !reachedEnd || tree.truncated,
  };
}

async function runPool<T>(items: T[], size: number, task: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
