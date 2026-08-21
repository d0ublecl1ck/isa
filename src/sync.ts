// GitHub Issues mirror: provider abstraction, conflict snapshots, and pull-side local records.
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createIssueFile,
  findIssueDocument,
  listIssueDocuments,
  saveIssueDocument,
  type IssueDocument,
  type IssueMetadata
} from "./issues.js";

export type RemoteIssueState = "open" | "closed";

export interface RemoteIssue {
  number: number;
  title: string;
  body: string;
  state: RemoteIssueState;
  htmlUrl: string;
  commentCount: number;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
}

export interface RemoteIssueComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface RemoteIssueInput {
  title: string;
  body: string;
  state: RemoteIssueState;
}

export interface IssueSyncProvider {
  assertReady(): Promise<void>;
  listIssues(): Promise<RemoteIssue[]>;
  createIssue(input: RemoteIssueInput): Promise<RemoteIssue>;
  updateIssue(number: number, input: RemoteIssueInput): Promise<void>;
  listComments(number: number): Promise<RemoteIssueComment[]>;
}

export interface SyncIssuesOptions {
  targetRoot: string;
  provider: IssueSyncProvider;
  pull?: boolean;
  force?: boolean;
  nextUuid?: () => string;
}

type GhRunner = (args: string[]) => Promise<string>;

export interface GitHubIssueProviderOptions {
  env?: NodeJS.ProcessEnv;
  runGh?: GhRunner;
}

interface GitHubApiIssue {
  number?: unknown;
  title?: unknown;
  body?: unknown;
  state?: unknown;
  html_url?: unknown;
  comments?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  closed_at?: unknown;
  pull_request?: unknown;
}

interface GitHubApiComment {
  id?: unknown;
  body?: unknown;
  html_url?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  user?: { login?: unknown } | null;
}

interface SyncMarker {
  id: string;
  hash: string;
}

const SYNC_MARKER_PATTERN = /\n?<!-- isa-sync id=([0-9a-f]{5}) sha256=([0-9a-f]{64}) -->\s*$/u;
const SOURCE_ISSUE_PATTERN = /^<!-- isa-github-issue: ([1-9][0-9]*) -->$/mu;
const TITLE_ID_PATTERN = /^\[([0-9a-f]{5})\](?:\s+|$)/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const ACCEPT_HEADER = "Accept: application/vnd.github+json";
const MANAGED_NOTICE = "> **Managed by ISA.**";

export async function syncIssues(options: SyncIssuesOptions): Promise<string> {
  const root = resolve(options.targetRoot);
  await options.provider.assertReady();

  let localIssues = await listIssueDocuments(root);
  const remoteIssues = await options.provider.listIssues();
  const lines: string[] = [];
  const conflicts: string[] = [];
  const remoteIndex = indexRemoteIssues(remoteIssues, conflicts);
  const remoteById = remoteIndex.byId;
  const blockedLocalIds = new Set(remoteIndex.blockedIds);
  const adoptedNumbers = new Set<number>();

  if (options.pull) {
    const localIndex = indexLocalSources(localIssues, conflicts);
    for (const id of localIndex.blockedLocalIds) {
      blockedLocalIds.add(id);
    }
    for (const remote of remoteIssues) {
      if (remoteIndex.blockedNumbers.has(remote.number) || localIndex.blockedRemoteNumbers.has(remote.number)) {
        continue;
      }
      const remoteId = getRemoteIssueId(remote);
      if (remoteId && remoteById.get(remoteId) === remote) {
        continue;
      }
      const recoveredLocal = localIndex.byRemoteNumber.get(remote.number);
      if (recoveredLocal) {
        remoteById.set(recoveredLocal.metadata.id, remote);
        adoptedNumbers.add(remote.number);
        continue;
      }
      const imported = await importRemoteIssue(root, remote, options.nextUuid ?? randomUUID);
      localIssues.push(imported.issue);
      localIndex.byRemoteNumber.set(remote.number, imported.issue);
      remoteById.set(imported.issue.metadata.id, remote);
      adoptedNumbers.add(remote.number);
      lines.push(`pulled GitHub issue #${remote.number} to ${imported.issue.relativePath}`);
    }
    localIssues.sort((left, right) => left.metadata.id.localeCompare(right.metadata.id));

    for (const issue of localIssues) {
      if (blockedLocalIds.has(issue.metadata.id)) {
        continue;
      }
      const remote = remoteById.get(issue.metadata.id);
      if (remote) {
        await pullComments(root, issue, remote, options.provider);
      }
    }
  }

  for (const issue of localIssues) {
    if (blockedLocalIds.has(issue.metadata.id)) {
      continue;
    }
    const remote = remoteById.get(issue.metadata.id);
    const desired = createRemoteInput(issue);
    if (!remote) {
      const created = await options.provider.createIssue(desired);
      remoteById.set(issue.metadata.id, created);
      lines.push(`created GitHub issue #${created.number} for ${issue.metadata.id}`);
      continue;
    }

    const conflict = getRemoteConflict(issue, remote);
    if (conflict && !options.force && !adoptedNumbers.has(remote.number)) {
      conflicts.push(conflict);
      continue;
    }
    if (remoteMatchesInput(remote, desired)) {
      lines.push(`unchanged GitHub issue #${remote.number} for ${issue.metadata.id}`);
      continue;
    }
    await options.provider.updateIssue(remote.number, desired);
    lines.push(`updated GitHub issue #${remote.number} for ${issue.metadata.id}`);
  }

  if (conflicts.length > 0) {
    const completed = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    throw new Error(`${completed}Issue sync completed with ${conflicts.length} conflict(s):\n${conflicts.join("\n")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "No Issues-as-Code changes to sync.";
}

export class GitHubIssueProvider implements IssueSyncProvider {
  private readonly env: NodeJS.ProcessEnv;
  private readonly runGh: GhRunner;
  private repository?: string;

  constructor(private readonly root: string, options: GitHubIssueProviderOptions = {}) {
    this.env = options.env ?? process.env;
    this.runGh = options.runGh ?? ((args) => executeGh(args, this.root, this.env));
  }

  async assertReady(): Promise<void> {
    try {
      await this.runGh(["--version"]);
    } catch {
      throw new Error("GitHub Issue sync requires the GitHub CLI (gh). Install it from https://cli.github.com/ and retry.");
    }

    if (!this.env.GH_TOKEN && !this.env.GITHUB_TOKEN) {
      try {
        await this.runGh(["auth", "status"]);
      } catch {
        throw new Error('GitHub authentication required. Run "gh auth login" or set GITHUB_TOKEN (GH_TOKEN is also supported), then retry.');
      }
    }

    const environmentRepository = this.env.GITHUB_REPOSITORY;
    if (environmentRepository !== undefined) {
      this.repository = assertRepository(environmentRepository);
      return;
    }
    try {
      this.repository = assertRepository((await this.runGh([
        "repo",
        "view",
        "--json",
        "nameWithOwner",
        "--jq",
        ".nameWithOwner"
      ])).trim());
    } catch (error) {
      throw new Error(`Could not determine the GitHub repository from ${this.root}. Run inside a GitHub checkout or set GITHUB_REPOSITORY=owner/repo. ${errorMessage(error)}`);
    }
  }

  async listIssues(): Promise<RemoteIssue[]> {
    const rows = parsePaginated<GitHubApiIssue>(await this.api([
      "--paginate",
      "--slurp",
      `repos/${this.requireRepository()}/issues?state=all&per_page=100`
    ]));
    return rows.filter((row) => row.pull_request === undefined).map(toRemoteIssue);
  }

  async createIssue(input: RemoteIssueInput): Promise<RemoteIssue> {
    const created = toRemoteIssue(parseObject<GitHubApiIssue>(await this.api([
      "--method",
      "POST",
      `repos/${this.requireRepository()}/issues`,
      "--raw-field",
      `title=${input.title}`,
      "--raw-field",
      `body=${input.body}`
    ])));
    if (input.state === "closed") {
      await this.updateIssue(created.number, input);
      return { ...created, ...input };
    }
    return created;
  }

  async updateIssue(number: number, input: RemoteIssueInput): Promise<void> {
    await this.api([
      "--method",
      "PATCH",
      `repos/${this.requireRepository()}/issues/${number}`,
      "--raw-field",
      `title=${input.title}`,
      "--raw-field",
      `body=${input.body}`,
      "--raw-field",
      `state=${input.state}`
    ]);
  }

  async listComments(number: number): Promise<RemoteIssueComment[]> {
    const rows = parsePaginated<GitHubApiComment>(await this.api([
      "--paginate",
      "--slurp",
      `repos/${this.requireRepository()}/issues/${number}/comments?per_page=100`
    ]));
    return rows.map(toRemoteComment);
  }

  private async api(args: string[]): Promise<string> {
    try {
      return await this.runGh(["api", "--header", ACCEPT_HEADER, ...args]);
    } catch (error) {
      throw new Error(`GitHub API request failed: ${errorMessage(error)}`);
    }
  }

  private requireRepository(): string {
    if (!this.repository) {
      throw new Error("GitHub Issue provider is not initialized. Call assertReady() first.");
    }
    return this.repository;
  }
}

interface RemoteIssueIndex {
  byId: Map<string, RemoteIssue>;
  blockedIds: Set<string>;
  blockedNumbers: Set<number>;
}

function indexRemoteIssues(remoteIssues: RemoteIssue[], conflicts: string[]): RemoteIssueIndex {
  const byId = new Map<string, RemoteIssue>();
  const blockedIds = new Set<string>();
  const blockedNumbers = new Set<number>();
  for (const remote of remoteIssues) {
    const marker = parseSyncMarker(remote.body);
    const titleId = TITLE_ID_PATTERN.exec(remote.title)?.[1];
    if (marker && titleId && marker.id !== titleId) {
      conflicts.push(`GitHub issue #${remote.number} has mismatched ISA IDs in its title and sync marker; skipped.`);
      blockedIds.add(marker.id);
      blockedIds.add(titleId);
      blockedNumbers.add(remote.number);
      byId.delete(marker.id);
      byId.delete(titleId);
      continue;
    }
    const id = marker?.id ?? titleId;
    if (!id) {
      continue;
    }
    if (blockedIds.has(id)) {
      blockedNumbers.add(remote.number);
      continue;
    }
    const existing = byId.get(id);
    if (existing) {
      conflicts.push(`GitHub issues #${existing.number} and #${remote.number} both mirror ${id}; skipped.`);
      blockedIds.add(id);
      blockedNumbers.add(existing.number);
      blockedNumbers.add(remote.number);
      byId.delete(id);
      continue;
    }
    byId.set(id, remote);
  }
  return { byId, blockedIds, blockedNumbers };
}

interface LocalSourceIndex {
  byRemoteNumber: Map<number, IssueDocument>;
  blockedRemoteNumbers: Set<number>;
  blockedLocalIds: Set<string>;
}

function indexLocalSources(localIssues: IssueDocument[], conflicts: string[]): LocalSourceIndex {
  const byRemoteNumber = new Map<number, IssueDocument>();
  const blockedRemoteNumbers = new Set<number>();
  const blockedLocalIds = new Set<string>();
  for (const issue of localIssues) {
    const source = SOURCE_ISSUE_PATTERN.exec(issue.body)?.[1];
    if (!source) {
      continue;
    }
    const number = Number(source);
    if (blockedRemoteNumbers.has(number)) {
      blockedLocalIds.add(issue.metadata.id);
      continue;
    }
    const existing = byRemoteNumber.get(number);
    if (existing) {
      conflicts.push(`${existing.relativePath} and ${issue.relativePath} both reference GitHub issue #${number}; skipped.`);
      blockedRemoteNumbers.add(number);
      blockedLocalIds.add(existing.metadata.id);
      blockedLocalIds.add(issue.metadata.id);
      byRemoteNumber.delete(number);
      continue;
    }
    byRemoteNumber.set(number, issue);
  }
  return { byRemoteNumber, blockedRemoteNumbers, blockedLocalIds };
}

function getRemoteIssueId(issue: RemoteIssue): string | undefined {
  return parseSyncMarker(issue.body)?.id ?? TITLE_ID_PATTERN.exec(issue.title)?.[1];
}

function createRemoteInput(issue: IssueDocument): RemoteIssueInput {
  const title = `[${issue.metadata.id}] ${issue.title}`;
  const state: RemoteIssueState = issue.metadata.status === "closed" || issue.metadata.status === "cancelled"
    ? "closed"
    : "open";
  const bodyWithoutMarker = [
    `${MANAGED_NOTICE} This GitHub Issue is a mirror; edit \`${issue.relativePath}\` in the repository.`,
    "> The repository file is the single source of truth.",
    "",
    issue.body.trim()
  ].join("\n");
  const hash = snapshotHash({ title, body: bodyWithoutMarker, state });
  return {
    title,
    state,
    body: `${bodyWithoutMarker}\n\n<!-- isa-sync id=${issue.metadata.id} sha256=${hash} -->`
  };
}

function getRemoteConflict(issue: IssueDocument, remote: RemoteIssue): string | undefined {
  const marker = parseSyncMarker(remote.body);
  const actual: RemoteIssueInput = {
    title: remote.title,
    body: stripSyncMarker(remote.body),
    state: remote.state
  };
  if (!marker) {
    const titleId = TITLE_ID_PATTERN.exec(remote.title)?.[1];
    if (titleId === issue.metadata.id && !remote.body.startsWith(MANAGED_NOTICE)) {
      return undefined;
    }
  }
  if (!marker || marker.id !== issue.metadata.id || snapshotHash(actual) !== marker.hash) {
    return `GitHub issue #${remote.number} for ${issue.metadata.id} changed since the last ISA sync; skipped. Re-run with --force to overwrite the mirror.`;
  }
  return undefined;
}

function remoteMatchesInput(remote: RemoteIssue, input: RemoteIssueInput): boolean {
  return remote.title === input.title && remote.body === input.body && remote.state === input.state;
}

function parseSyncMarker(body: string): SyncMarker | undefined {
  const match = SYNC_MARKER_PATTERN.exec(body);
  return match ? { id: match[1], hash: match[2] } : undefined;
}

function stripSyncMarker(body: string): string {
  return body.replace(SYNC_MARKER_PATTERN, "").trimEnd();
}

function snapshotHash(input: RemoteIssueInput): string {
  return createHash("sha256").update(JSON.stringify({
    title: input.title,
    body: input.body,
    state: input.state
  })).digest("hex");
}

async function importRemoteIssue(
  root: string,
  remote: RemoteIssue,
  nextUuid: () => string
): Promise<{ issue: IssueDocument }> {
  const title = normalizeRemoteTitle(remote.title, remote.number);
  const created = await createIssueFile(root, title, false, nextUuid);
  const issue = await findIssueDocument(root, created.id);
  const now = new Date().toISOString();
  const createdAt = normalizeTimestamp(remote.createdAt, now);
  const updatedAt = normalizeTimestamp(remote.updatedAt, now);
  const closedAt = normalizeTimestamp(remote.closedAt, updatedAt);
  const metadata: IssueMetadata = remote.state === "closed"
    ? {
        id: created.id,
        status: "closed",
        created_at: createdAt,
        updated_at: updatedAt,
        started_at: createdAt,
        closed_at: closedAt
      }
    : {
        id: created.id,
        status: "open",
        created_at: createdAt,
        updated_at: updatedAt
      };
  const body = createImportedBody(title, remote);
  await saveIssueDocument(issue, metadata, body);
  return { issue: await findIssueDocument(root, created.id) };
}

function createImportedBody(title: string, remote: RemoteIssue): string {
  const remoteBody = remote.body.trim()
    ? remote.body.replace(/\r\n?/g, "\n").split("\n").map((line) => `> ${line}`).join("\n")
    : "> _No description was provided on GitHub._";
  const closed = remote.state === "closed";
  return [
    `# ${title}`,
    "",
    "## Background",
    "",
    `Imported from [GitHub issue #${remote.number}](${remote.htmlUrl}).`,
    `<!-- isa-github-issue: ${remote.number} -->`,
    "",
    remoteBody,
    "",
    "## Scope",
    "",
    `- Triage and address the report from GitHub issue #${remote.number}.`,
    "",
    "## Non-goals",
    "",
    "- None.",
    "",
    "## Acceptance Criteria",
    "",
    closed
      ? "- [x] Preserve the imported closed GitHub issue as a repository record."
      : "- [ ] Define and satisfy the acceptance criteria after triage.",
    "",
    "## Implementation",
    "",
    closed ? `Imported the closed record from GitHub issue #${remote.number}.` : "Pending triage.",
    "",
    "## Verification",
    "",
    closed ? `- Confirmed GitHub issue #${remote.number} was closed when imported.` : "Pending triage.",
    "",
    "## Related ADRs",
    "",
    "- None."
  ].join("\n");
}

async function pullComments(
  root: string,
  issue: IssueDocument,
  remote: RemoteIssue,
  provider: IssueSyncProvider
): Promise<void> {
  const commentsRoot = join(root, "docs", "issues", "comments");
  const commentsPath = join(commentsRoot, `${issue.metadata.id}.md`);
  if (remote.commentCount === 0 && !existsSync(commentsPath)) {
    return;
  }
  const comments = await provider.listComments(remote.number);
  const content = renderComments(issue, remote, comments);
  const previous = await readFile(commentsPath, "utf8").catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  });
  if (previous === content) {
    return;
  }
  await mkdir(commentsRoot, { recursive: true });
  await writeFile(commentsPath, content, "utf8");
}

function renderComments(issue: IssueDocument, remote: RemoteIssue, comments: RemoteIssueComment[]): string {
  const sections = comments.length > 0
    ? comments.map((comment) => [
        `## Comment ${comment.id}`,
        "",
        `- Author: @${comment.author}`,
        `- Created: ${comment.createdAt}`,
        `- Updated: ${comment.updatedAt}`,
        `- Source: ${comment.htmlUrl}`,
        "",
        comment.body.trim() || "_Empty comment._"
      ].join("\n"))
    : ["- No GitHub comments."];
  return [
    `# GitHub comments for ${issue.metadata.id}`,
    "",
    `Mirror of [GitHub issue #${remote.number}](${remote.htmlUrl}). Do not edit this generated record manually.`,
    "",
    ...sections,
    ""
  ].join("\n");
}

function normalizeRemoteTitle(title: string, number: number): string {
  const normalized = title.replace(/[\r\n\u2028\u2029]+/gu, " ").replace(/\s+/gu, " ").trim();
  return normalized || `GitHub issue ${number}`;
}

function normalizeTimestamp(value: string | undefined, fallback: string): string {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

function assertRepository(value: string): string {
  if (!REPOSITORY_PATTERN.test(value)) {
    throw new Error(`Invalid GitHub repository "${value}"; expected owner/repo.`);
  }
  return value;
}

function parsePaginated<T>(raw: string): T[] {
  const value: unknown = JSON.parse(raw || "[]");
  if (!Array.isArray(value)) {
    throw new Error("GitHub API returned a non-array paginated response.");
  }
  return value.flatMap((entry) => Array.isArray(entry) ? entry as T[] : [entry as T]);
}

function parseObject<T>(raw: string): T {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("GitHub API returned a non-object response.");
  }
  return value as T;
}

function toRemoteIssue(value: GitHubApiIssue): RemoteIssue {
  if (!Number.isInteger(value.number) || typeof value.title !== "string" || (value.state !== "open" && value.state !== "closed")) {
    throw new Error("GitHub API returned an invalid Issue record.");
  }
  return {
    number: value.number as number,
    title: value.title,
    body: typeof value.body === "string" ? value.body : "",
    state: value.state,
    htmlUrl: typeof value.html_url === "string" ? value.html_url : "",
    commentCount: Number.isInteger(value.comments) ? value.comments as number : 0,
    createdAt: typeof value.created_at === "string" ? value.created_at : undefined,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : undefined,
    closedAt: typeof value.closed_at === "string" ? value.closed_at : undefined
  };
}

function toRemoteComment(value: GitHubApiComment): RemoteIssueComment {
  if (!Number.isInteger(value.id) || typeof value.created_at !== "string" || typeof value.updated_at !== "string") {
    throw new Error("GitHub API returned an invalid Issue comment record.");
  }
  return {
    id: value.id as number,
    author: typeof value.user?.login === "string" ? value.user.login : "ghost",
    body: typeof value.body === "string" ? value.body : "",
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    htmlUrl: typeof value.html_url === "string" ? value.html_url : ""
  };
}

function executeGh(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile("gh", args, { cwd, env, maxBuffer: 20 * 1024 * 1024, timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        rejectPromise(new Error(stderr.trim() || error.message));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
