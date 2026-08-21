// Local Git traceability for Issues-as-Code commit trailers and source lines.
import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface IssueCommit {
  sha: string;
  subject: string;
  issueId: string;
  issueTrailerCount: number;
  closesId: string;
  closesTrailerCount: number;
}

export async function validateIssueBranch(
  targetRoot: string,
  issueId: string,
  knownIssueIds: ReadonlySet<string>,
  explicitBase?: string
): Promise<IssueCommit[]> {
  const root = resolve(targetRoot);
  if (await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])) {
    throw new Error("Issue close requires a clean Git worktree. Commit or discard pending changes first.");
  }

  const base = await resolveBaseCommit(root, explicitBase);
  const shas = splitLines(await git(root, ["rev-list", "--no-merges", `${base}..HEAD`]));
  if (shas.length === 0) {
    throw new Error(`Issue close found no commits after base ${explicitBase ?? base}.`);
  }

  const commits = await Promise.all(shas.map((sha) => readCommit(root, sha)));
  for (const commit of commits) {
    if (!commit.issueId) {
      throw new Error(`Commit ${commit.sha.slice(0, 7)} must contain exactly one Issue: <id> trailer.`);
    }
    if (!knownIssueIds.has(commit.issueId)) {
      throw new Error(`Commit ${commit.sha.slice(0, 7)} references unknown Issue ${commit.issueId}.`);
    }
    if (commit.closesTrailerCount > 0) {
      if (!commit.closesId) {
        throw new Error(`Commit ${commit.sha.slice(0, 7)} must contain exactly one Closes: <id> trailer.`);
      }
      if (!knownIssueIds.has(commit.closesId)) {
        throw new Error(`Commit ${commit.sha.slice(0, 7)} references unknown Issue ${commit.closesId} in its Closes trailer.`);
      }
      if (commit.closesId !== commit.issueId) {
        throw new Error(`Commit ${commit.sha.slice(0, 7)} Closes trailer must match its Issue trailer.`);
      }
    }
  }
  if (!commits.some((commit) => commit.issueId === issueId)) {
    throw new Error(`Issue ${issueId} has no linked commit after the selected base.`);
  }
  return commits;
}

export async function findCloseBindingCommit(targetRoot: string, issueId: string): Promise<IssueCommit | undefined> {
  const root = resolve(targetRoot);
  const lines = splitLines(await git(root, [
    "log",
    "--all",
    "--no-merges",
    "--fixed-strings",
    `--grep=Closes: ${issueId}`,
    "--format=%H"
  ]));
  const commits = await Promise.all(lines.map((sha) => readCommit(root, sha)));
  for (const commit of commits) {
    if (commit.closesId !== issueId || commit.issueId !== issueId) {
      continue;
    }
    const touchedRaw = await git(root, ["show", "--pretty=format:", "--name-only", "-z", commit.sha]);
    const touchedPaths = touchedRaw.split("\0").map((path) => path.trim()).filter(Boolean);
    if (touchedPaths.some((path) => path.startsWith(`docs/issues/${issueId}-`) || path.startsWith(`docs/issues/closed/${issueId}-`))) {
      return commit;
    }
  }
  return undefined;
}

export async function traceIssueCommits(targetRoot: string, issueId: string): Promise<IssueCommit[]> {
  const root = resolve(targetRoot);
  const lines = splitLines(await git(root, [
    "log",
    "--all",
    "--no-merges",
    "--fixed-strings",
    `--grep=Issue: ${issueId}`,
    "--format=%H"
  ]));
  const commits = await Promise.all(lines.map((sha) => readCommit(root, sha)));
  return commits.filter((commit) => commit.issueId === issueId);
}

export async function traceIssueLine(targetRoot: string, targetFile: string, line: number): Promise<IssueCommit> {
  const root = resolve(targetRoot);
  const absolutePath = isAbsolute(targetFile) ? resolve(targetFile) : resolve(root, targetFile);
  const relativePath = relative(root, absolutePath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Issue trace file must be inside the target root: ${targetFile}`);
  }

  const blame = await git(root, ["blame", "--line-porcelain", "-L", `${line},${line}`, "--", relativePath]);
  const sha = blame.match(/^([0-9a-f]{40})\s/)?.[1];
  if (!sha || /^0+$/.test(sha)) {
    throw new Error(`Issue trace cannot resolve an uncommitted line: ${targetFile}:${line}`);
  }
  const commit = await readCommit(root, sha);
  if (!commit.issueId && commit.issueTrailerCount > 0) {
    throw new Error(`Commit ${sha.slice(0, 7)} must contain exactly one Issue: <id> trailer.`);
  }
  return commit;
}

async function resolveBaseCommit(root: string, explicitBase?: string): Promise<string> {
  const candidates: string[] = [];
  if (explicitBase) {
    candidates.push(explicitBase);
  } else {
    try {
      const remoteHead = await git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
      if (remoteHead) {
        candidates.push(remoteHead);
      }
    } catch {
      // Fall through to conventional remote branch names.
    }
    candidates.push("origin/main", "origin/master");
  }

  for (const candidate of candidates) {
    try {
      return await git(root, ["rev-parse", "--verify", "--end-of-options", `${candidate}^{commit}`]);
    } catch {
      if (explicitBase) {
        throw new Error(`Issue close base is not a commit: ${explicitBase}`);
      }
    }
  }
  throw new Error("Issue close could not infer a base commit. Pass --base <ref>.");
}

async function readCommit(root: string, sha: string): Promise<IssueCommit> {
  const [subject, message] = await Promise.all([
    git(root, ["show", "-s", "--format=%s", sha]),
    git(root, ["show", "-s", "--format=%B", sha])
  ]);
  // Tolerate trailers split into separate paragraphs (e.g. multiple -m flags):
  // match Issue:/Closes: lines anywhere in the full message instead of relying
  // on %(trailers), which only recognizes the trailing contiguous trailer block.
  const issueTrailers = matchTrailers(message, "Issue");
  const closesTrailers = matchTrailers(message, "Closes");
  const issueId = issueTrailers.length === 1 && /^[0-9a-f]{5}$/.test(issueTrailers[0]) ? issueTrailers[0] : "";
  const closesId = closesTrailers.length === 1 && /^[0-9a-f]{5}$/.test(closesTrailers[0]) ? closesTrailers[0] : "";
  return { sha, subject, issueId, issueTrailerCount: issueTrailers.length, closesId, closesTrailerCount: closesTrailers.length };
}

function matchTrailers(message: string, key: string): string[] {
  const pattern = new RegExp(`^${key}:\\s*(\\S+)$`, "gm");
  return [...message.matchAll(pattern)].map((match) => match[1].trim()).filter(Boolean);
}

async function git(root: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", args, { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    return result.stdout.trim();
  } catch (error) {
    const message = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr).trim() : String(error);
    throw new Error(message || `Git command failed: git ${args.join(" ")}`);
  }
}

function splitLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}
