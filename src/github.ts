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

export class RateLimitError extends Error {
  constructor(readonly resetAt: Date | null) {
    super("GitHub API rate limit reached.");
  }
}

export interface FetchResult {
  snapshot: CitySnapshot;
  /** Set when the limit was hit while reading commits: heights use only what was read before it. */
  rateLimitReset?: Date | null;
}

export async function fetchSnapshot(
  owner: string,
  name: string,
  options: { token?: string; onProgress?: (text: string) => void } = {},
): Promise<FetchResult> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  // Updated from every response, so we never plan more requests than GitHub will allow.
  let remaining = Infinity;
  let resetAt: Date | null = null;

  async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`, { headers });
    const left = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (left !== null) remaining = Number(left);
    if (reset !== null) resetAt = new Date(Number(reset) * 1000);
    if (res.status === 429 || (res.status === 403 && remaining === 0)) throw new RateLimitError(resetAt);
    if (res.status === 401) throw new Error("The GitHub token was rejected.");
    if (res.status === 403) throw new Error("GitHub refused the request (the token may not have access).");
    if (res.status === 404) throw new Error("Repository not found (private repositories need a token).");
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
  // Keep a couple of requests spare so the next city can at least show its streets.
  const wanted = options.token ? COMMIT_LIMIT.withToken : COMMIT_LIMIT.withoutToken;
  const limit = Math.max(0, Math.min(wanted, remaining - 1 - Math.ceil(wanted / 100) - 2));
  const shas: string[] = [];
  let reachedEnd = false;
  let rateLimitReset: Date | null | undefined;
  try {
    for (let page = 1; shas.length < limit; page++) {
      const perPage = Math.min(100, limit);
      const list = await getJson<{ sha: string; parents: unknown[] }[]>(
        `${repoPath}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}&page=${page}`,
      );
      shas.push(...list.filter((c) => c.parents.length < 2).map((c) => c.sha));
      if (list.length < perPage) {
        reachedEnd = true;
        break;
      }
    }
  } catch (error) {
    if (!(error instanceof RateLimitError)) throw error;
    rateLimitReset = error.resetAt;
  }
  shas.length = Math.min(shas.length, limit);
  if (limit < wanted && !reachedEnd) rateLimitReset ??= resetAt;

  const commits: (CommitChanges | undefined)[] = new Array(shas.length);
  let done = 0;
  let stopped = false;
  await runPool(shas, 8, async (sha, i) => {
    if (stopped) return;
    try {
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
    } catch (error) {
      // Out of requests: draw the city with the commits read so far.
      if (!(error instanceof RateLimitError)) throw error;
      stopped = true;
      rateLimitReset = error.resetAt;
    }
  });

  // Newest first, with any commits we couldn't read left out.
  const read = commits.filter((c): c is CommitChanges => c !== undefined);
  const edits = countEdits(read, blobs.map((b) => b.path));
  return {
    snapshot: {
      format: "commit-city/1",
      repo: `${owner}/${name}`,
      name: `${owner}/${name}`,
      branch,
      files: blobs.map((b) => ({ path: b.path, size: b.size ?? 0, ...edits.get(b.path)! })),
      commitsScanned: read.length,
      partialHistory: !reachedEnd || read.length < shas.length || tree.truncated,
    },
    rateLimitReset,
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
