// Reads a local git repository and writes a commit-city snapshot (JSON) to stdout.
//
//   npm run scan -- path/to/repo > my-repo.city.json
//
// Then open the city page and drop the file onto it. Works for private
// repositories too, and reads the whole history without touching the GitHub API.

import { execFileSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { countEdits, type ChangeStatus, type CitySnapshot, type CommitChanges } from "../src/history.ts";

const repoDir = resolve(process.argv[2] ?? ".");
const git = (...args: string[]) =>
  execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8", maxBuffer: 1 << 30 });

const branch = git("rev-parse", "--abbrev-ref", "HEAD").trim();

const sizes = new Map<string, number>();
for (const line of git("ls-tree", "-r", "-l", "-z", "HEAD").split("\0")) {
  // "<mode> blob <sha> <size>\t<path>"
  const match = line.match(/^\d+ blob \w+ +(\d+)\t(.*)$/s);
  if (match) sizes.set(match[2], Number(match[1]));
}

const commits: CommitChanges[] = [];
const log = git("log", "--no-merges", "-M", "--name-status", "-z", "--format=%x01%at", "HEAD");
for (const chunk of log.split("\x01").slice(1)) {
  const fields = chunk.split("\0");
  const time = Number(fields[0].trim());
  const changes: CommitChanges["changes"] = [];
  for (let i = 1; i < fields.length; ) {
    const status = fields[i].trim();
    if (!status) {
      i++;
      continue;
    }
    if (status.startsWith("R") || status.startsWith("C")) {
      changes.push({ status: status[0] === "R" ? "R" : "A", from: fields[i + 1], path: fields[i + 2] });
      i += 3;
    } else {
      changes.push({ status: status[0] as ChangeStatus, path: fields[i + 1] });
      i += 2;
    }
  }
  commits.push({ time, changes });
}

const edits = countEdits(commits, sizes.keys());
let origin = "";
try {
  origin = git("remote", "get-url", "origin").trim();
} catch {
  // No remote: links to GitHub are simply left out.
}
const github = origin.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);

const snapshot: CitySnapshot = {
  format: "commit-city/1",
  repo: github?.[1],
  name: github?.[1] ?? basename(repoDir),
  branch,
  files: [...sizes].map(([path, size]) => ({ path, size, ...edits.get(path)! })),
  commitsScanned: commits.length,
  partialHistory: git("rev-parse", "--is-shallow-repository").trim() === "true",
};
process.stdout.write(JSON.stringify(snapshot));
process.stderr.write(`${snapshot.name}: ${snapshot.files.length} files, ${commits.length} commits\n`);
