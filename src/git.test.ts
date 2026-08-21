// Issues-as-Code Git trailer and blame tests.
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { findCloseBindingCommit, traceIssueLine, validateIssueBranch } from "./git.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

describe("traceIssueLine", () => {
  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots.length = 0;
  });

  it("accepts a commit carrying both Issue and Closes trailers for the same issue", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c\nCloses: a1b2c");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["a1b2c"]))).resolves.toHaveLength(1);
  });

  it("accepts Issue and Closes trailers separated into distinct paragraphs by multiple -m flags", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c", "-m", "Closes: a1b2c");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["a1b2c"]))).resolves.toHaveLength(1);
  });

  it("accepts trailers separated from the subject by a body paragraph", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Some explanatory body paragraph.\n\nIssue: a1b2c\nCloses: a1b2c");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["a1b2c"]))).resolves.toHaveLength(1);
  });

  it("rejects duplicate Issue trailers spread across paragraphs", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c", "-m", "Issue: a1b2c");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["a1b2c"]))).rejects.toThrow(/exactly one Issue/);
  });

  it("rejects a segmented Closes trailer that does not match the Issue trailer", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c", "-m", "Closes: d3e4f");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["a1b2c", "d3e4f"]))).rejects.toThrow(/Closes trailer must match its Issue trailer/);
  });

  it("rejects a Closes trailer that does not match the Issue trailer", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c\nCloses: d3e4f");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["a1b2c", "d3e4f"]))).rejects.toThrow(/Closes trailer must match its Issue trailer/);
  });

  it("rejects a Closes trailer referencing an unknown issue", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c\nCloses: a1b2c");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["d3e4f"]))).rejects.toThrow(/unknown Issue a1b2c/);
  });

  it("rejects duplicate Closes trailers", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c\nCloses: a1b2c\nCloses: a1b2c");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["a1b2c"]))).rejects.toThrow(/exactly one Closes/);
  });

  it("finds the binding commit that closes an issue in a single commit", async () => {
    const root = await initRepoWithBase();
    await mkdir(join(root, "docs", "issues"), { recursive: true });
    await writeFile(join(root, "docs", "issues", "a1b2c-demo.md"), "status: closed\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: implement and close", "-m", "Issue: a1b2c\nCloses: a1b2c");

    const binding = await findCloseBindingCommit(root, "a1b2c");

    expect(binding?.subject).toBe("feat: implement and close");
    expect(binding?.issueId).toBe("a1b2c");
    expect(binding?.closesId).toBe("a1b2c");
  });

  it("finds the binding commit when the issue document has a non-ASCII filename", async () => {
    const root = await initRepoWithBase();
    await mkdir(join(root, "docs", "issues"), { recursive: true });
    await writeFile(join(root, "docs", "issues", "a1b2c-支持双-trailer.md"), "status: closed\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "feat: implement and close", "-m", "Issue: a1b2c\nCloses: a1b2c");

    const binding = await findCloseBindingCommit(root, "a1b2c");

    expect(binding?.subject).toBe("feat: implement and close");
  });

  it("returns undefined when no commit carries a Closes trailer for the issue", async () => {
    const root = await initRepoWithBase();
    await mkdir(join(root, "docs", "issues"), { recursive: true });
    await writeFile(join(root, "docs", "issues", "a1b2c-demo.md"), "status: closed\n", "utf8");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "docs: close issue", "-m", "Issue: a1b2c");

    await expect(findCloseBindingCommit(root, "a1b2c")).resolves.toBeUndefined();
  });

  it("returns undefined when the Closes commit did not touch the issue document", async () => {
    const root = await initRepoWithBase();
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: unrelated change", "-m", "Issue: a1b2c\nCloses: a1b2c");

    await expect(findCloseBindingCommit(root, "a1b2c")).resolves.toBeUndefined();
  });

  it("returns the single Issue trailer from the blamed commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "isa-git-"));
    roots.push(root);
    await git(root, "init", "-b", "main");
    await git(root, "config", "user.name", "ISA Test");
    await git(root, "config", "user.email", "isa@example.com");
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c");

    await expect(traceIssueLine(root, "feature.ts", 1)).resolves.toMatchObject({
      subject: "feat: add value",
      issueId: "a1b2c"
    });
  });

  it.each([
    ["origin/HEAD", "trunk", true],
    ["origin/master", "master", false]
  ])("infers the close base from %s", async (_candidate, branch, setRemoteHead) => {
    const root = await mkdtemp(join(tmpdir(), "isa-git-"));
    roots.push(root);
    await git(root, "init", "-b", branch);
    await git(root, "config", "user.name", "ISA Test");
    await git(root, "config", "user.email", "isa@example.com");
    await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "chore: initialize repository");
    await git(root, "update-ref", `refs/remotes/origin/${branch}`, "HEAD");
    if (setRemoteHead) {
      await git(root, "symbolic-ref", "refs/remotes/origin/HEAD", `refs/remotes/origin/${branch}`);
    }
    await writeFile(join(root, "feature.ts"), "export const value = 1;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "feat: add value", "-m", "Issue: a1b2c");

    await expect(validateIssueBranch(root, "a1b2c", new Set(["a1b2c"]))).resolves.toHaveLength(1);
  });
});

async function git(root: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: root });
}

async function initRepoWithBase(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "isa-git-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ISA Test");
  await git(root, "config", "user.email", "isa@example.com");
  await writeFile(join(root, "README.md"), "# Demo\n", "utf8");
  await git(root, "add", "README.md");
  await git(root, "commit", "-m", "chore: initialize repository");
  await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  return root;
}
