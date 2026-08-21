// GitHub Issues synchronization tests: push idempotency, conflicts, pull imports, and auth boundaries.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIssueCommand } from "./commands.js";
import {
  GitHubIssueProvider,
  syncIssues,
  type IssueSyncProvider,
  type RemoteIssue,
  type RemoteIssueComment,
  type RemoteIssueInput
} from "./sync.js";

const tmpRoots: string[] = [];

describe("syncIssues", () => {
  afterEach(async () => {
    await Promise.all(tmpRoots.map((root) => rm(root, { recursive: true, force: true })));
    tmpRoots.length = 0;
  });

  it("creates managed GitHub mirrors once and performs zero writes when unchanged", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", title: "Mirror this issue", status: "open" });
    const provider = new FakeProvider();

    const first = await syncIssues({ targetRoot: root, provider });
    const second = await syncIssues({ targetRoot: root, provider });

    expect(first).toContain("created GitHub issue #1 for a1b2c");
    expect(second).toContain("unchanged GitHub issue #1 for a1b2c");
    expect(provider.creates).toHaveLength(1);
    expect(provider.updates).toHaveLength(0);
    expect(provider.creates[0]?.title).toBe("[a1b2c] Mirror this issue");
    expect(provider.creates[0]?.body).toMatch(/^> \*\*Managed by ISA\.\*\*/);
    expect(provider.creates[0]?.body).toContain("edit `docs/issues/a1b2c-mirror-this-issue.md`");
    expect(provider.creates[0]?.body).toContain("<!-- isa-sync id=a1b2c sha256=");
  });

  it("adopts an existing ID-prefixed GitHub issue on the first sync", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", title: "Existing mirror", status: "open" });
    const provider = new FakeProvider([{
      number: 7,
      title: "[a1b2c] Stale title",
      body: "Created before ISA stored sync snapshots.",
      state: "open",
      htmlUrl: "https://github.com/example/repo/issues/7",
      commentCount: 0
    }]);

    const output = await syncIssues({ targetRoot: root, provider });

    expect(output).toContain("updated GitHub issue #7 for a1b2c");
    expect(provider.creates).toHaveLength(0);
    expect(provider.updates).toHaveLength(1);
    expect(provider.issues[0]?.title).toBe("[a1b2c] Existing mirror");
  });

  it("maps local closed and reopened states to the GitHub issue", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", title: "Lifecycle issue", status: "open" });
    const provider = new FakeProvider();
    await syncIssues({ targetRoot: root, provider });

    await writeIssue(root, { id: "a1b2c", title: "Lifecycle issue", status: "closed" });
    await syncIssues({ targetRoot: root, provider });
    expect(provider.updates.at(-1)?.input.state).toBe("closed");

    await writeIssue(root, { id: "a1b2c", title: "Lifecycle issue", status: "open" });
    await syncIssues({ targetRoot: root, provider });
    expect(provider.updates.at(-1)?.input.state).toBe("open");
  });

  it("skips a manually edited mirror as a conflict unless force is explicit", async () => {
    const root = await createTmpRoot();
    await writeIssue(root, { id: "a1b2c", title: "Protected issue", status: "open" });
    const provider = new FakeProvider();
    await syncIssues({ targetRoot: root, provider });
    provider.updates.length = 0;
    provider.issues[0]!.body += "\nManual GitHub edit.";

    await expect(syncIssues({ targetRoot: root, provider })).rejects.toThrow(
      "GitHub issue #1 for a1b2c changed since the last ISA sync"
    );
    expect(provider.updates).toHaveLength(0);

    const forced = await syncIssues({ targetRoot: root, provider, force: true });
    expect(forced).toContain("updated GitHub issue #1 for a1b2c");
    expect(provider.updates).toHaveLength(1);
    expect(provider.issues[0]?.body).not.toContain("Manual GitHub edit.");
  });

  it("pulls new GitHub issues and comments into stable local records without duplicates", async () => {
    const root = await createTmpRoot();
    const provider = new FakeProvider([
      {
        number: 42,
        title: "Reported from GitHub",
        body: "A community report.\n\n## Remote heading",
        state: "open",
        htmlUrl: "https://github.com/example/repo/issues/42",
        commentCount: 1
      }
    ], new Map([[42, [{
      id: 9001,
      author: "octocat",
      body: "Extra reproduction details.",
      createdAt: "2026-07-25T12:00:00Z",
      updatedAt: "2026-07-25T12:00:00Z",
      htmlUrl: "https://github.com/example/repo/issues/42#issuecomment-9001"
    }]]]));
    const nextUuid = () => "a1b2c000-0000-4000-8000-000000000000";

    const first = await syncIssues({ targetRoot: root, provider, pull: true, nextUuid });
    const second = await syncIssues({ targetRoot: root, provider, pull: true, nextUuid });

    expect(first).toContain("pulled GitHub issue #42 to docs/issues/a1b2c-reported-from-github.md");
    expect(second).not.toContain("pulled GitHub issue #42 to");
    const issueFiles = (await readdir(join(root, "docs", "issues"))).filter((name) => name.endsWith(".md"));
    expect(issueFiles).toEqual(["a1b2c-reported-from-github.md"]);
    const issue = await readFile(join(root, "docs", "issues", issueFiles[0]!), "utf8");
    expect(issue).toContain("<!-- isa-github-issue: 42 -->");
    expect(issue).toContain("> A community report.");
    expect(issue).toContain("> ## Remote heading");
    const comments = await readFile(join(root, "docs", "issues", "comments", "a1b2c.md"), "utf8");
    expect(comments).toContain("@octocat");
    expect(comments).toContain("Extra reproduction details.");
    expect(provider.issues[0]?.title).toBe("[a1b2c] Reported from GitHub");
    expect(provider.creates).toHaveLength(0);
    expect(provider.updates).toHaveLength(1);
  });

  it("does not initialize a network provider for existing local-only Issue commands", async () => {
    const root = await createTmpRoot();
    const provider = new FakeProvider();
    provider.readyError = new Error("network provider should not run");

    const output = await runIssueCommand({
      action: "new",
      values: ["Offline", "issue"],
      targetRoot: root,
      syncProvider: provider
    });

    expect(output).toContain("created docs/issues/");
    expect(provider.readyCalls).toBe(0);
  });
});

describe("GitHubIssueProvider", () => {
  it("reports actionable authentication guidance when no token or gh login is available", async () => {
    const provider = new GitHubIssueProvider("/tmp/repo", {
      env: {},
      runGh: async (args) => {
        if (args[0] === "--version") {
          return "gh version 2";
        }
        throw new Error("not logged in");
      }
    });

    await expect(provider.assertReady()).rejects.toThrow(
      'Run "gh auth login" or set GITHUB_TOKEN (GH_TOKEN is also supported)'
    );
  });

  it("uses GITHUB_TOKEN and the repository environment without requiring stored gh auth", async () => {
    const calls: string[][] = [];
    const provider = new GitHubIssueProvider("/tmp/repo", {
      env: { GITHUB_TOKEN: "test-token", GITHUB_REPOSITORY: "example/repo" },
      runGh: async (args) => {
        calls.push(args);
        if (args[0] === "--version") {
          return "gh version 2";
        }
        if (args[0] === "api") {
          return "[]";
        }
        throw new Error(`unexpected gh call: ${args.join(" ")}`);
      }
    });

    await provider.assertReady();
    await provider.listIssues();

    expect(calls.some((args) => args[0] === "auth")).toBe(false);
    expect(calls.at(-1)?.join(" ")).toContain("repos/example/repo/issues");
  });
});

class FakeProvider implements IssueSyncProvider {
  readonly creates: RemoteIssueInput[] = [];
  readonly updates: Array<{ number: number; input: RemoteIssueInput }> = [];
  readyCalls = 0;
  readyError?: Error;

  constructor(
    readonly issues: RemoteIssue[] = [],
    private readonly comments = new Map<number, RemoteIssueComment[]>()
  ) {}

  async assertReady(): Promise<void> {
    this.readyCalls += 1;
    if (this.readyError) {
      throw this.readyError;
    }
  }

  async listIssues(): Promise<RemoteIssue[]> {
    return this.issues.map((issue) => ({ ...issue }));
  }

  async createIssue(input: RemoteIssueInput): Promise<RemoteIssue> {
    this.creates.push({ ...input });
    const issue: RemoteIssue = {
      number: this.issues.length + 1,
      title: input.title,
      body: input.body,
      state: input.state,
      htmlUrl: `https://github.com/example/repo/issues/${this.issues.length + 1}`,
      commentCount: 0
    };
    this.issues.push(issue);
    return { ...issue };
  }

  async updateIssue(number: number, input: RemoteIssueInput): Promise<void> {
    this.updates.push({ number, input: { ...input } });
    const issue = this.issues.find((candidate) => candidate.number === number);
    if (!issue) {
      throw new Error(`missing fake issue #${number}`);
    }
    Object.assign(issue, input);
  }

  async listComments(number: number): Promise<RemoteIssueComment[]> {
    return (this.comments.get(number) ?? []).map((comment) => ({ ...comment }));
  }
}

async function createTmpRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "isa-sync-"));
  tmpRoots.push(root);
  return root;
}

interface WriteIssueOptions {
  id: string;
  title: string;
  status: "open" | "closed";
}

async function writeIssue(root: string, options: WriteIssueOptions): Promise<void> {
  const slug = options.title.toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "");
  const closedMetadata = options.status === "closed"
    ? ['started_at: "2026-07-25T00:00:00Z"', 'closed_at: "2026-07-25T01:00:00Z"']
    : [];
  const content = [
    "---",
    `id: ${options.id}`,
    `status: ${options.status}`,
    'created_at: "2026-07-25T00:00:00Z"',
    'updated_at: "2026-07-25T00:00:00Z"',
    ...closedMetadata,
    "---",
    "",
    `# ${options.title}`,
    "",
    "## Background",
    "",
    "Defined behavior.",
    "",
    "## Scope",
    "",
    "Defined behavior.",
    "",
    "## Non-goals",
    "",
    "None.",
    "",
    "## Acceptance Criteria",
    "",
    options.status === "closed" ? "- [x] Mirror behavior works." : "- [ ] Mirror behavior works.",
    "",
    "## Implementation",
    "",
    options.status === "closed" ? "Implemented mirror behavior." : "Pending.",
    "",
    "## Verification",
    "",
    options.status === "closed" ? "Verified mirror behavior." : "Pending.",
    "",
    "## Related ADRs",
    "",
    "- None.",
    ""
  ].join("\n");
  await mkdir(join(root, "docs", "issues"), { recursive: true });
  await writeFile(join(root, "docs", "issues", `${options.id}-${slug}.md`), content, "utf8");
}
