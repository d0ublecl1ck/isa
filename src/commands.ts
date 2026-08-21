// Issues-as-Code command — local Issue lifecycle and bidirectional Git traceability.
import { resolve } from "node:path";
import {
  addCancellationSection,
  archiveIssueDocument,
  assertIssueClosable,
  assertIssueReady,
  attachIssueFiles,
  createIssueFile,
  findIssueDocument,
  listIssueDocuments,
  renameIssueDocument,
  saveIssueDocument,
  type IssueStatus
} from "./issues.js";
import { findCloseBindingCommit, traceIssueCommits, traceIssueLine, validateIssueBranch } from "./git.js";
import { GitHubIssueProvider, syncIssues, type IssueSyncProvider } from "./sync.js";

export interface IssueCommandArgs {
  action: string;
  values: string[];
  targetRoot?: string;
  targetFile?: string;
  line?: number;
  status?: string;
  offset?: number;
  limit?: number;
  base?: string;
  dryRun?: boolean;
  prepare?: boolean;
  pull?: boolean;
  force?: boolean;
  section?: string;
  syncProvider?: IssueSyncProvider;
}

export async function runIssueCommand(args: IssueCommandArgs): Promise<string> {
  const root = resolve(args.targetRoot ?? ".");

  if (args.action === "sync") {
    return syncIssues({
      targetRoot: root,
      provider: args.syncProvider ?? new GitHubIssueProvider(root),
      pull: args.pull,
      force: args.force
    });
  }

  if (args.action === "new") {
    const title = requireText(args.values, "Issue new requires a title.");
    const result = await createIssueFile(root, title, args.dryRun, undefined, { section: args.section });
    return `${result.status} ${result.relativePath}${args.dryRun ? "" : `\nIssue: ${result.id}`}`;
  }

  if (args.action === "list") {
    const status = parseStatusFilter(args.status);
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 20;
    assertPagination(offset, limit);
    const issues = (await listIssueDocuments(root)).filter((issue) =>
      status === "all"
        ? true
        : status
          ? issue.metadata.status === status
          : issue.metadata.status === "open" || issue.metadata.status === "in-progress"
    );
    if (issues.length === 0) {
      return status ? `No ${status} Issues-as-Code found.` : "No active Issues-as-Code found.";
    }
    const page = issues.slice(offset, offset + limit);
    if (page.length === 0) {
      return `No Issues-as-Code found at offset ${offset}.\nShowing 0 of ${issues.length} Issues.`;
    }
    const end = offset + page.length;
    const lines = [
      "ID\tStatus\tTitle\tPath",
      ...page.map((issue) => `${issue.metadata.id}\t${issue.metadata.status}\t${issue.title}\t${issue.relativePath}`),
      "",
      `Showing ${offset + 1}-${end} of ${issues.length} Issues.`
    ];
    if (end < issues.length) {
      const next = [
        "isa list",
        ...(status ? ["--status", status] : []),
        "--offset", String(end),
        "--limit", String(limit),
        ...(args.targetRoot ? ["-t", JSON.stringify(args.targetRoot)] : [])
      ];
      lines.push(`Next: ${next.join(" ")}`);
    }
    return lines.join("\n");
  }

  if (args.action === "show") {
    return (await findIssueDocument(root, requireId(args.values))).content;
  }

  if (args.action === "rename") {
    const id = requireId(args.values.slice(0, 1));
    const title = requireText(args.values.slice(1), "Issue rename requires a new title.");
    const result = await renameIssueDocument(await findIssueDocument(root, id), title, args.dryRun);
    return `${args.dryRun ? "dry-run" : "renamed"} ${result.oldRelativePath} -> ${result.newRelativePath}`;
  }

  if (args.action === "start") {
    const issue = await findIssueDocument(root, requireId(args.values));
    assertIssueReady(issue);
    if (issue.metadata.status === "open") {
      const now = new Date().toISOString();
      await saveIssueDocument(issue, {
        ...issue.metadata,
        status: "in-progress",
        updated_at: now,
        started_at: now
      }, issue.body, args.dryRun);
    }
    return [
      args.dryRun ? `dry-run Issue ${issue.metadata.id} start.` : `Issue ${issue.metadata.id} started.`,
      "",
      "Implementation prompt:",
      `Treat ${issue.relativePath} as the source of truth.`,
      "Implement only its Scope and Acceptance Criteria, preserve its Non-goals, and use TDD.",
      "Update Implementation and Verification before closing it.",
      `Every non-merge commit must contain exactly this trailer: Issue: ${issue.metadata.id}`,
      `Single-commit close: run "isa close ${issue.metadata.id} --prepare" before committing, then add both Issue: ${issue.metadata.id} and Closes: ${issue.metadata.id} trailers.`
    ].join("\n");
  }

  if (args.action === "close") {
    const issue = await findIssueDocument(root, requireId(args.values));

    if (issue.metadata.status === "closed" && !args.prepare) {
      const binding = await findCloseBindingCommit(root, issue.metadata.id).catch(() => undefined);
      if (!binding) {
        throw new Error(
          `Issue ${issue.metadata.id} is closed but no commit carries both Issue: ${issue.metadata.id} and Closes: ${issue.metadata.id}. Commit the closed state with both trailers, then re-run close.`
        );
      }
      await archiveIssueDocument(issue, args.dryRun);
      return `Issue ${issue.metadata.id} already closed; bound to commit ${binding.sha.slice(0, 7)}.`;
    }

    assertIssueClosable(issue);

    if (args.prepare) {
      const now = new Date().toISOString();
      await saveIssueDocument(issue, {
        ...issue.metadata,
        status: "closed",
        updated_at: now,
        closed_at: now
      }, issue.body, args.dryRun);
      const archivedPath = await archiveIssueDocument(issue, args.dryRun);
      return [
        `${args.dryRun ? "dry-run" : "prepared"} ${archivedPath}`,
        "",
        "Commit the implementation and this status flip in ONE commit with trailers:",
        "",
        `Issue: ${issue.metadata.id}`,
        `Closes: ${issue.metadata.id}`,
        "",
        `Then run "isa close ${issue.metadata.id}" to verify the binding.`
      ].join("\n");
    }

    const issueIds = new Set((await listIssueDocuments(root)).map((item) => item.metadata.id));
    await validateIssueBranch(root, issue.metadata.id, issueIds, args.base);
    const now = new Date().toISOString();
    await saveIssueDocument(issue, {
      ...issue.metadata,
      status: "closed",
      updated_at: now,
      closed_at: now
    }, issue.body, args.dryRun);
    const archivedPath = await archiveIssueDocument(issue, args.dryRun);
    return `${args.dryRun ? "dry-run" : "closed"} ${archivedPath}`;
  }

  if (args.action === "cancel") {
    const id = requireId(args.values.slice(0, 1));
    const reason = requireText(args.values.slice(1), "Issue cancel requires a reason.");
    const issue = await findIssueDocument(root, id);
    if (issue.metadata.status === "closed" || issue.metadata.status === "cancelled") {
      throw new Error(`Issue ${id} is ${issue.metadata.status} and cannot be cancelled.`);
    }
    const now = new Date().toISOString();
    await saveIssueDocument(issue, {
      ...issue.metadata,
      status: "cancelled",
      updated_at: now,
      cancelled_at: now
    }, addCancellationSection(issue.body, reason), args.dryRun);
    const archivedPath = await archiveIssueDocument(issue, args.dryRun);
    return `${args.dryRun ? "dry-run" : "cancelled"} ${archivedPath}`;
  }

  if (args.action === "attach") {
    const id = requireId(args.values.slice(0, 1));
    const files = args.values.slice(1);
    const issue = await findIssueDocument(root, id);
    const result = await attachIssueFiles(issue, files, args.dryRun);
    return result.relativePaths
      .map((relativePath) => `${args.dryRun ? "dry-run" : "attached"} ${relativePath}`)
      .join("\n");
  }

  if (args.action === "trace") {
    if (args.targetFile !== undefined || args.line !== undefined) {
      if (!args.targetFile || !args.line || args.values.length > 0) {
        throw new Error("Issue trace requires either <id> or --file <path> --line <number>.");
      }
      const commit = await traceIssueLine(root, args.targetFile, args.line);
      if (!commit.issueId) {
        return [
          `${args.targetFile}:${args.line}`,
          `${commit.sha.slice(0, 12)}\t${commit.subject}`,
          `No linked Issue: commit ${commit.sha.slice(0, 7)} predates Issues-as-Code (missing Issue: <id> trailer).`
        ].join("\n");
      }
      const issue = await findIssueDocument(root, commit.issueId);
      return [
        `${args.targetFile}:${args.line}`,
        `${commit.sha.slice(0, 12)}\t${commit.subject}`,
        `${issue.metadata.id}\t${issue.title}\t${issue.relativePath}`
      ].join("\n");
    }

    const issue = await findIssueDocument(root, requireId(args.values));
    const commits = await traceIssueCommits(root, issue.metadata.id);
    return [
      `${issue.metadata.id}\t${issue.title}\t${issue.relativePath}`,
      ...(commits.length > 0
        ? commits.map((commit) => `${commit.sha.slice(0, 12)}\t${commit.subject}`)
        : ["No linked commits found."])
    ].join("\n");
  }

  throw new Error(`Unsupported Issue action "${args.action}".`);
}

function requireId(values: string[]): string {
  if (values.length !== 1 || !/^[0-9a-f]{5}$/.test(values[0])) {
    throw new Error("Issue command requires exactly one five-character lowercase hexadecimal ID.");
  }
  return values[0];
}

function requireText(values: string[], message: string): string {
  const text = values.join(" ").trim();
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function parseStatusFilter(value?: string): IssueStatus | "all" | undefined {
  if (value === undefined || value === "all" || value === "open" || value === "in-progress" || value === "closed" || value === "cancelled") {
    return value;
  }
  throw new Error(`Unsupported Issue status "${value}".`);
}

function assertPagination(offset: number, limit: number): void {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("--offset requires a non-negative integer.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("--limit requires an integer from 1 to 100.");
  }
}
