/** A file as the city sees it: where it is, how big it is, and how often it was edited. */
export interface RepoFile {
  path: string;
  size: number;
  /** Number of commits that touched this file (following renames). */
  edits: number;
  /** Unix seconds of the latest commit that touched it, when known. */
  lastEdited?: number;
}

/** Everything needed to draw one city. Produced by the GitHub API loader or by `npm run scan`. */
export interface CitySnapshot {
  format: "commit-city/1";
  /** "owner/name" on GitHub, used for links. Absent for local repositories. */
  repo?: string;
  name: string;
  branch: string;
  files: RepoFile[];
  /** How many commits the edit counts are based on. */
  commitsScanned: number;
  /** True when only part of the history was read (edit counts are a lower bound). */
  partialHistory: boolean;
}

export type ChangeStatus = "A" | "M" | "D" | "R";

export interface FileChange {
  status: ChangeStatus;
  path: string;
  /** For renames: the path before the commit. */
  from?: string;
}

export interface CommitChanges {
  time: number;
  changes: FileChange[];
}

/**
 * Counts edits per current path. `commits` must be newest first, so a rename
 * can send the older history of the old name to the file's current name.
 */
export function countEdits(
  commits: CommitChanges[],
  currentPaths: Iterable<string>,
): Map<string, { edits: number; lastEdited: number }> {
  const result = new Map<string, { edits: number; lastEdited: number }>();
  for (const path of currentPaths) result.set(path, { edits: 0, lastEdited: 0 });
  // Historical path -> path it has today.
  const renamedTo = new Map<string, string>();
  const resolve = (path: string) => renamedTo.get(path) ?? path;

  for (const commit of commits) {
    const seen = new Set<string>();
    for (const change of commit.changes) {
      const current = resolve(change.path);
      if (change.status === "R" && change.from) renamedTo.set(change.from, current);
      const entry = result.get(current);
      if (!entry || seen.has(current)) continue;
      seen.add(current);
      entry.edits += 1;
      entry.lastEdited = Math.max(entry.lastEdited, commit.time);
    }
  }
  return result;
}
