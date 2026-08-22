// Issues-as-Code command tests: lifecycle, validation, and local Git traceability.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runIssueCommand } from "./commands.js";

const execFileAsync = promisify(execFile);
const tmpRoots: string[] = [];

describe("runIssueCommand", () => {
  afterEach(async () => {
    await Promise.all(tmpRoots.map((tmpRoot) => rm(tmpRoot, { recursive: true, force: true })));
    tmpRoots.length = 0;
  });

  it("creates an open Issue document with the required contract", async () => {
    const root = await createTmpRoot();

    const output = await runIssueCommand({
      action: "new",
      values: ["支持", "本地追踪"],
      targetRoot: root,
      dryRun: false
    });

    const files = await readdir(join(root, "docs", "issues"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{5}-支持-本地追踪\.md$/u);
    expect(output).toContain(`created docs/issues/${files[0]}`);

    const issue = await readFile(join(root, "docs", "issues", files[0]), "utf8");
    expect(issue).toMatch(/^---\nid: "?[0-9a-f]{5}"?\nstatus: open\n/);
    expect(issue).toContain("# 支持 本地追踪");
    expect(issue).toContain("## Acceptance Criteria\n\n- [ ] TODO");
    expect(issue).toContain("## Verification");
  });

  it("creates an Issue anchored to a design section via --section", async () => {
    const root = await createTmpRoot();

    const output = await runIssueCommand({
      action: "new",
      values: ["锚定", "数据模型"],
      targetRoot: root,
      section: "数据模型"
    });

    const files = await readdir(join(root, "docs", "issues"));
    expect(output).toContain(`created docs/issues/${files[0]}`);
    const issue = await readFile(join(root, "docs", "issues", files[0]), "utf8");
    expect(issue).toContain("design_section: 数据模型");
  });

  it("does not create files for new in dry-run mode", async () => {
    const root = await createTmpRoot();

    const output = await runIssueCommand({
      action: "new",
      values: ["Dry", "run"],
      targetRoot: root,
      dryRun: true
    });

    expect(output).toMatch(/^dry-run docs\/issues\/[0-9a-f]{5}-dry-run\.md$/);
    await expect(readdir(join(root, "docs", "issues"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("lists active Issues by default and can show a closed Issue", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Open issue" });
    await writeIssue(root, { id: "d3e4f", status: "in-progress", title: "Active issue" });
    await writeIssue(root, { id: "0abcd", status: "closed", title: "Closed issue", complete: true });

    const list = await runIssueCommand({ action: "list", values: [], targetRoot: root });
    const closedList = await runIssueCommand({ action: "list", values: [], targetRoot: root, status: "closed" });
    const show = await runIssueCommand({ action: "show", values: ["0abcd"], targetRoot: root });

    expect(list).toContain("a1b2c\topen\tOpen issue");
    expect(list).toContain("d3e4f\tin-progress\tActive issue");
    expect(list).not.toContain("0abcd");
    expect(closedList).toContain("0abcd\tclosed\tClosed issue");
    expect(show).toContain("# Closed issue");
    expect(show).toContain("status: closed");
  });

  it("lists the first 20 filtered Issues by default and prints a next-page command", async () => {
    const root = await createTmpRoot();
    await Promise.all(Array.from({ length: 25 }, (_, index) => writeIssue(root, {
      id: `a${index.toString(16).padStart(4, "0")}`,
      status: "open",
      title: `Issue ${index}`
    })));

    const output = await runIssueCommand({ action: "list", values: [], targetRoot: root });

    expect(output).toContain("a0000\topen\tIssue 0");
    expect(output).toContain("a0013\topen\tIssue 19");
    expect(output).not.toContain("a0014\topen\tIssue 20");
    expect(output).toContain("Showing 1-20 of 25 Issues.");
    expect(output).toContain(`Next: isa list --offset 20 --limit 20 -t ${JSON.stringify(root)}`);
  });

  it("applies offset and limit after status filtering", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a0000", status: "open", title: "Open issue" });
    await writeIssue(root, { id: "a0001", status: "closed", title: "First closed", complete: true });
    await writeIssue(root, { id: "a0002", status: "closed", title: "Second closed", complete: true });
    await writeIssue(root, { id: "a0003", status: "open", title: "Another open" });
    await writeIssue(root, { id: "a0004", status: "closed", title: "Third closed", complete: true });

    const output = await runIssueCommand({
      action: "list",
      values: [],
      targetRoot: root,
      status: "closed",
      offset: 1,
      limit: 1
    });

    expect(output).not.toContain("a0001\tclosed\tFirst closed");
    expect(output).toContain("a0002\tclosed\tSecond closed");
    expect(output).not.toContain("a0004\tclosed\tThird closed");
    expect(output).toContain("Showing 2-2 of 3 Issues.");
    expect(output).toContain(`Next: isa list --status closed --offset 2 --limit 1 -t ${JSON.stringify(root)}`);

    const lastPage = await runIssueCommand({ action: "list", values: [], targetRoot: root, status: "closed", offset: 2, limit: 2 });
    expect(lastPage).toContain("a0004\tclosed\tThird closed");
    expect(lastPage).toContain("Showing 3-3 of 3 Issues.");
    expect(lastPage).not.toContain("Next:");
  });

  it("reports an empty page when offset exceeds a non-empty filtered result", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Open issue" });

    const output = await runIssueCommand({ action: "list", values: [], targetRoot: root, offset: 2 });

    expect(output).toBe("No Issues-as-Code found at offset 2.\nShowing 0 of 1 Issues.");
  });

  it("keeps the existing message when no Issues match the status filter", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Open issue" });

    await expect(runIssueCommand({ action: "list", values: [], targetRoot: root, status: "cancelled" }))
      .resolves.toBe("No cancelled Issues-as-Code found.");
  });

  it("attaches files under assets/<id> and links them in the document", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Open issue" });
    await writeFile(join(root, "screen shot.png"), "png", "utf8");

    const output = await runIssueCommand({
      action: "attach",
      values: ["a1b2c", join(root, "screen shot.png")],
      targetRoot: root
    });

    expect(output).toContain("attached docs/issues/assets/a1b2c/screen shot.png");
    await expect(readFile(join(root, "docs", "issues", "assets", "a1b2c", "screen shot.png"), "utf8")).resolves.toBe("png");
    const show = await runIssueCommand({ action: "show", values: ["a1b2c"], targetRoot: root });
    expect(show).toContain("## Attachments\n\n- [screen shot.png](assets/a1b2c/screen%20shot.png)\n\n## Related ADRs");
  });

  it("rejects attach for a missing Issue without creating files", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Open issue" });
    await writeFile(join(root, "screen.png"), "png", "utf8");

    await expect(runIssueCommand({
      action: "attach",
      values: ["d3e4f", join(root, "screen.png")],
      targetRoot: root
    })).rejects.toThrow("Issue d3e4f was not found");
    await expect(readdir(join(root, "docs", "issues"))).resolves.not.toContain("assets");
  });

  it("does not copy files for attach in dry-run mode", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Open issue" });
    await writeFile(join(root, "screen.png"), "png", "utf8");

    const output = await runIssueCommand({
      action: "attach",
      values: ["a1b2c", join(root, "screen.png")],
      targetRoot: root,
      dryRun: true
    });

    expect(output).toContain("dry-run docs/issues/assets/a1b2c/screen.png");
    await expect(readdir(join(root, "docs", "issues"))).resolves.not.toContain("assets");
    const show = await runIssueCommand({ action: "show", values: ["a1b2c"], targetRoot: root });
    expect(show).not.toContain("## Attachments");
  });

  it("renames the title and slug without changing the Issue ID", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Old title" });

    await runIssueCommand({
      action: "rename",
      values: ["a1b2c", "新的", "标题"],
      targetRoot: root,
      dryRun: true
    });
    await expect(readFile(join(root, "docs", "issues", "a1b2c-old-title.md"), "utf8")).resolves.toContain("# Old title");

    const output = await runIssueCommand({
      action: "rename",
      values: ["a1b2c", "新的", "标题"],
      targetRoot: root,
      dryRun: false
    });

    expect(output).toBe("renamed docs/issues/a1b2c-old-title.md -> docs/issues/a1b2c-新的-标题.md");
    await expect(readFile(join(root, "docs", "issues", "a1b2c-old-title.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const renamed = await readFile(join(root, "docs", "issues", "a1b2c-新的-标题.md"), "utf8");
    expect(renamed).toContain("id: a1b2c");
    expect(renamed).toContain("# 新的 标题");
  });

  it("starts a ready Issue and prints an implementation prompt", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Ready issue", ready: true });

    const preview = await runIssueCommand({ action: "start", values: ["a1b2c"], targetRoot: root, dryRun: true });
    expect(preview).toContain("dry-run Issue a1b2c start.");
    await expect(readFile(join(root, "docs", "issues", "a1b2c-ready-issue.md"), "utf8")).resolves.toContain("status: open");

    const output = await runIssueCommand({ action: "start", values: ["a1b2c"], targetRoot: root, dryRun: false });
    const started = await readFile(join(root, "docs", "issues", "a1b2c-ready-issue.md"), "utf8");

    expect(output).toContain("Issue a1b2c started.");
    expect(output).toContain("Treat docs/issues/a1b2c-ready-issue.md as the source of truth.");
    expect(output).toContain("Issue: a1b2c");
    expect(started).toContain("status: in-progress");
    expect(started).toContain("started_at:");
  });

  it("rejects start while required intent sections still contain TODO", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Draft issue" });

    await expect(runIssueCommand({ action: "start", values: ["a1b2c"], targetRoot: root })).rejects.toThrow(
      "Issue a1b2c is not ready"
    );
  });

  it("cancels a non-terminal Issue with a visible reason", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Cancelled issue", ready: true });

    await runIssueCommand({
      action: "cancel",
      values: ["a1b2c", "需求", "已被替代"],
      targetRoot: root,
      dryRun: true
    });
    await expect(readFile(join(root, "docs", "issues", "a1b2c-cancelled-issue.md"), "utf8")).resolves.toContain("status: open");

    const output = await runIssueCommand({
      action: "cancel",
      values: ["a1b2c", "需求", "已被替代"],
      targetRoot: root,
      dryRun: false
    });

    expect(output).toBe("cancelled docs/issues/closed/a1b2c-cancelled-issue.md");
    const cancelled = await readFile(join(root, "docs", "issues", "closed", "a1b2c-cancelled-issue.md"), "utf8");
    expect(cancelled).toContain("status: cancelled");
    expect(cancelled).toContain("## Cancellation\n\nReason: 需求 已被替代");
    expect(cancelled).toContain("cancelled_at:");
  });

  it("prepares a single-commit close without commits or a clean worktree", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");

    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Complete issue", complete: true });

    const dryRunOutput = await runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root, prepare: true, dryRun: true });
    await expect(readFile(join(root, "docs", "issues", "a1b2c-complete-issue.md"), "utf8")).resolves.toContain("status: in-progress");

    const output = await runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root, prepare: true });
    const prepared = await readFile(join(root, "docs", "issues", "closed", "a1b2c-complete-issue.md"), "utf8");

    expect(dryRunOutput).toContain("dry-run");
    expect(output).toContain("prepared docs/issues/closed/a1b2c-complete-issue.md");
    expect(output).toContain("Issue: a1b2c");
    expect(output).toContain("Closes: a1b2c");
    expect(prepared).toContain("status: closed");
    expect(prepared).toContain("closed_at:");
  });

  it("verifies an already-closed issue bound to a single commit without new writes", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");

    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Complete issue", complete: true });
    await runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root, prepare: true });
    await writeFile(join(root, "feature.txt"), "implemented\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: implement and close", "-m", "Issue: a1b2c\nCloses: a1b2c");

    const output = await runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root });

    expect(output).toContain("already closed");
    expect(output).toContain("bound to commit");
    await expect(git(root, "status", "--porcelain")).resolves.toBe("");
    await expect(readFile(join(root, "docs", "issues", "closed", "a1b2c-complete-issue.md"), "utf8")).resolves.toContain("status: closed");
    expect(await readdir(join(root, "docs", "issues"))).not.toContain("a1b2c-complete-issue.md");
  });

  it("rejects verification for a closed issue without a Closes binding commit", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");

    await writeIssue(root, { id: "a1b2c", status: "closed", title: "Complete issue", complete: true });
    await git(root, "add", ".");
    await git(root, "commit", "-m", "docs: legacy close", "-m", "Issue: a1b2c");

    await expect(runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root })).rejects.toThrow(/Closes: a1b2c/);
  });

  it("closes a complete Issue after validating the branch commit trailers", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");

    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Complete issue", complete: true });
    await writeFile(join(root, "feature.txt"), "implemented\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: implement issue", "-m", "Issue: a1b2c");

    await runIssueCommand({
      action: "close",
      values: ["a1b2c"],
      targetRoot: root,
      base: "HEAD~1",
      dryRun: true
    });
    await expect(readFile(join(root, "docs", "issues", "a1b2c-complete-issue.md"), "utf8")).resolves.toContain("status: in-progress");

    const output = await runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root, dryRun: false });
    const closed = await readFile(join(root, "docs", "issues", "closed", "a1b2c-complete-issue.md"), "utf8");

    expect(output).toBe([
      "closed docs/issues/closed/a1b2c-complete-issue.md",
      "",
      "Commit the archived status flip with both trailers:",
      "",
      "Issue: a1b2c",
      "Closes: a1b2c"
    ].join("\n"));
    expect(closed).toContain("status: closed");
    expect(closed).toContain("closed_at:");
    expect(await readdir(join(root, "docs", "issues"))).not.toContain("a1b2c-complete-issue.md");
    await expect(git(root, "status", "--porcelain")).resolves.toMatch(/^R/m);
  });

  it("rejects close when a branch commit has no Issue trailer", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");

    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Broken trace", complete: true });
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: missing trailer");

    await expect(runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root })).rejects.toThrow(
      "must contain exactly one Issue: <id> trailer"
    );
  });

  it("rejects close before acceptance criteria and evidence are complete", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Incomplete issue", ready: true });

    await expect(runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root })).rejects.toThrow(
      "every Acceptance Criteria item must be checked"
    );
  });

  it.each(["*", "+"])("rejects close when a nested %s acceptance item is unchecked", async (bullet) => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Nested acceptance", complete: true });
    const path = join(root, "docs", "issues", "a1b2c-nested-acceptance.md");
    const content = await readFile(path, "utf8");
    await writeFile(path, content.replace(
      "- [x] Expected behavior is implemented.",
      `- [x] Parent behavior is implemented.\n  ${bullet} [ ] Nested behavior is implemented.`
    ), "utf8");

    await expect(runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root })).rejects.toThrow(
      "every Acceptance Criteria item must be checked"
    );
  });

  it("rejects close when the worktree contains uncommitted files", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Dirty issue", complete: true });

    await expect(runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root })).rejects.toThrow(
      "requires a clean Git worktree"
    );
  });

  it("rejects a source line whose commit has multiple Issue trailers", async () => {
    const root = await createGitRoot();
    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "First issue", complete: true });
    await writeIssue(root, { id: "d3e4f", status: "in-progress", title: "Second issue", complete: true });
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: ambiguous trace", "-m", "Issue: a1b2c\nIssue: d3e4f");

    await expect(runIssueCommand({
      action: "trace",
      values: [],
      targetRoot: root,
      targetFile: "feature.ts",
      line: 1
    })).rejects.toThrow("must contain exactly one Issue: <id> trailer");
  });

  it("reports no linked Issue when the blamed commit predates Issues-as-Code", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "legacy.ts"), "export const legacy = 1;\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "chore: legacy commit without trailer");

    const output = await runIssueCommand({
      action: "trace",
      values: [],
      targetRoot: root,
      targetFile: "legacy.ts",
      line: 1
    });

    expect(output).toContain("legacy.ts:1");
    expect(output).toContain("chore: legacy commit without trailer");
    expect(output).toContain("No linked Issue");
    expect(output).toContain("predates Issues-as-Code");
  });

  it("traces an Issue to commits and a committed source line back to the Issue", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Trace issue", complete: true });
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: add traced line", "-m", "Issue: a1b2c");

    const byIssue = await runIssueCommand({ action: "trace", values: ["a1b2c"], targetRoot: root });
    const byLine = await runIssueCommand({
      action: "trace",
      values: [],
      targetRoot: root,
      targetFile: "feature.ts",
      line: 1
    });

    expect(byIssue).toContain("a1b2c\tTrace issue");
    expect(byIssue).toContain("feat: add traced line");
    expect(byLine).toContain("feature.ts:1");
    expect(byLine).toContain("a1b2c\tTrace issue");
  });

  it("rejects tracing a source line with uncommitted changes", async () => {
    const root = await createGitRoot();
    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Trace issue", complete: true });
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: add traced line", "-m", "Issue: a1b2c");
    await writeFile(join(root, "feature.ts"), "export const value = 2;\n", "utf8");

    await expect(runIssueCommand({
      action: "trace",
      values: [],
      targetRoot: root,
      targetFile: "feature.ts",
      line: 1
    })).rejects.toThrow("cannot resolve an uncommitted line");
  });

  it("treats replacement tokens literally and rejects multiline titles and reasons", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Old title" });

    await runIssueCommand({ action: "rename", values: ["a1b2c", "New", "$&"], targetRoot: root });
    const renamed = await readFile(join(root, "docs", "issues", "a1b2c-new.md"), "utf8");
    expect(renamed).toContain("# New $&");

    await expect(runIssueCommand({ action: "new", values: ["Injected\n## Scope"], targetRoot: root })).rejects.toThrow(
      "Issue title must be a single line"
    );
    await expect(runIssueCommand({ action: "rename", values: ["a1b2c", "Injected\n# Title"], targetRoot: root })).rejects.toThrow(
      "Issue title must be a single line"
    );
    await expect(runIssueCommand({ action: "cancel", values: ["a1b2c", "Injected\n## Cancellation"], targetRoot: root })).rejects.toThrow(
      "Issue cancellation reason must be a single line"
    );

    await runIssueCommand({ action: "cancel", values: ["a1b2c", "Keep", "$&", "literal"], targetRoot: root });
    const cancelled = await readFile(join(root, "docs", "issues", "closed", "a1b2c-new.md"), "utf8");
    expect(cancelled).toContain("## Cancellation\n\nReason: Keep $& literal");
  });

  it.each([
    ["rename", ["a1b2c", "New title"]],
    ["start", ["a1b2c"]],
    ["close", ["a1b2c"]],
    ["cancel", ["a1b2c", "No longer needed"]]
  ])("rejects %s for a closed Issue", async (action, values) => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "closed", title: "Terminal issue", complete: true });

    await expect(runIssueCommand({ action, values, targetRoot: root })).rejects.toThrow(/closed|in-progress/);
  });

  it("finds, lists, and shows Issues archived under docs/issues/closed/", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", status: "open", title: "Open issue" });
    await writeIssue(root, { id: "0abcd", status: "closed", title: "Closed issue", complete: true, archived: true });

    const list = await runIssueCommand({ action: "list", values: [], targetRoot: root });
    const closedList = await runIssueCommand({ action: "list", values: [], targetRoot: root, status: "closed" });
    const allList = await runIssueCommand({ action: "list", values: [], targetRoot: root, status: "all" });
    const show = await runIssueCommand({ action: "show", values: ["0abcd"], targetRoot: root });

    expect(list).toContain("a1b2c\topen\tOpen issue");
    expect(list).not.toContain("0abcd");
    expect(closedList).toContain("0abcd\tclosed\tClosed issue\tdocs/issues/closed/0abcd-closed-issue.md");
    expect(allList).toContain("0abcd\tclosed\tClosed issue\tdocs/issues/closed/0abcd-closed-issue.md");
    expect(show).toContain("# Closed issue");
    expect(show).toContain("status: closed");
  });

  it("archives a legacy flat closed Issue when close re-verifies its binding", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");

    await writeIssue(root, { id: "a1b2c", status: "closed", title: "Complete issue", complete: true });
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: legacy close", "-m", "Issue: a1b2c\nCloses: a1b2c");

    const output = await runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root });

    expect(output).toContain("already closed");
    await expect(readFile(join(root, "docs", "issues", "closed", "a1b2c-complete-issue.md"), "utf8")).resolves.toContain("status: closed");
    expect(await readdir(join(root, "docs", "issues"))).not.toContain("a1b2c-complete-issue.md");
  });

  it("rewrites attachment links when archiving an Issue on close", async () => {
    const root = await createGitRoot();
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");

    await writeIssue(root, { id: "a1b2c", status: "in-progress", title: "Complete issue", complete: true });
    await writeFile(join(root, "note.txt"), "note\n", "utf8");
    await runIssueCommand({ action: "attach", values: ["a1b2c", join(root, "note.txt")], targetRoot: root });
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: implement issue", "-m", "Issue: a1b2c");

    await runIssueCommand({ action: "close", values: ["a1b2c"], targetRoot: root });

    const closed = await readFile(join(root, "docs", "issues", "closed", "a1b2c-complete-issue.md"), "utf8");
    expect(closed).toContain("](../assets/a1b2c/note.txt)");
    expect(closed).not.toContain("](assets/a1b2c/");
    await expect(readFile(join(root, "docs", "issues", "assets", "a1b2c", "note.txt"), "utf8")).resolves.toBe("note\n");
  });

  it("attaches files to an archived Issue with ../assets links", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "0abcd", status: "closed", title: "Closed issue", complete: true, archived: true });
    await writeFile(join(root, "screen.png"), "png", "utf8");

    const output = await runIssueCommand({
      action: "attach",
      values: ["0abcd", join(root, "screen.png")],
      targetRoot: root
    });

    expect(output).toContain("attached docs/issues/assets/0abcd/screen.png");
    await expect(readFile(join(root, "docs", "issues", "assets", "0abcd", "screen.png"), "utf8")).resolves.toBe("png");
    const show = await runIssueCommand({ action: "show", values: ["0abcd"], targetRoot: root });
    expect(show).toContain("- [screen.png](../assets/0abcd/screen.png)");
  });
});

interface WriteIssueOptions {
  id: string;
  status: "open" | "in-progress" | "closed" | "cancelled";
  title: string;
  ready?: boolean;
  complete?: boolean;
  archived?: boolean;
}

async function writeIssue(root: string, options: WriteIssueOptions): Promise<void> {
  const slug = options.title.toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "");
  const statusTimes = [
    options.status === "in-progress" || options.status === "closed" ? 'started_at: "2026-07-21T00:00:00Z"' : "",
    options.status === "closed" ? 'closed_at: "2026-07-21T00:00:00Z"' : "",
    options.status === "cancelled" ? 'cancelled_at: "2026-07-21T00:00:00Z"' : ""
  ].filter(Boolean);
  const intent = options.ready || options.complete ? "Defined behavior." : "TODO";
  const acceptance = options.complete ? "- [x] Expected behavior is implemented." : "- [ ] Expected behavior is implemented.";
  const implementation = options.complete ? "Implemented the expected behavior." : "<!-- 完成实现后填写。 -->";
  const verification = options.complete ? "- `npm test` passed." : "<!-- 完成验证后填写命令及结果。 -->";
  const content = [
    "---",
    `id: ${options.id}`,
    `status: ${options.status}`,
    'created_at: "2026-07-21T00:00:00Z"',
    'updated_at: "2026-07-21T00:00:00Z"',
    ...statusTimes,
    "---",
    "",
    `# ${options.title}`,
    "",
    "## Background",
    "",
    intent,
    "",
    "## Scope",
    "",
    intent,
    "",
    "## Non-goals",
    "",
    "None.",
    "",
    "## Acceptance Criteria",
    "",
    acceptance,
    "",
    "## Implementation",
    "",
    implementation,
    "",
    "## Verification",
    "",
    verification,
    "",
    "## Related ADRs",
    "",
    "- None.",
    ""
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");

  const issueRoot = options.archived ? join(root, "docs", "issues", "closed") : join(root, "docs", "issues");
  await mkdir(issueRoot, { recursive: true });
  await writeFile(join(issueRoot, `${options.id}-${slug}.md`), content, "utf8");
}

async function createTmpRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "isa-command-"));
  tmpRoots.push(root);
  return root;
}

async function createGitRoot(): Promise<string> {
  const root = await createTmpRoot();
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ISA Test");
  await git(root, "config", "user.email", "isa@example.com");
  return root;
}

async function git(root: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root });
  return result.stdout.trim();
}
