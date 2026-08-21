// Issues-as-Code document tests: stable IDs, Unicode slugs, and repository validation.
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addCancellationSection, addIssueAttachmentLinks, assertIssueClosable, assertIssueReady, attachIssueFiles, createIssueFile, createIssueId, findIssueDocument, inspectIssueDocuments, renameIssueDocument, slugifyIssueTitle } from "./issues.js";

const tmpRoots: string[] = [];

describe("Issues-as-Code documents", () => {
  afterEach(async () => {
    await Promise.all(tmpRoots.map((tmpRoot) => rm(tmpRoot, { recursive: true, force: true })));
    tmpRoots.length = 0;
  });

  it("keeps Unicode letters in deterministic filename slugs", () => {
    expect(slugifyIssueTitle("  修复 API / Retry!  ")).toBe("修复-api-retry");
  });

  it("retries when the first five UUID characters collide", () => {
    const uuids = ["c2b57fff-0000-4000-8000-000000000000", "a1b2cfff-0000-4000-8000-000000000000"];

    expect(createIssueId(new Set(["c2b57"]), () => uuids.shift()!)).toBe("a1b2c");
  });

  it("retries atomically when an Issue ID appears during creation", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const uuids = ["a1b2cfff-0000-4000-8000-000000000000", "d3e4ffff-0000-4000-8000-000000000000"];

    const result = await createIssueFile(root, "Raced title", false, () => {
      const uuid = uuids.shift()!;
      if (uuid.startsWith("a1b2c")) {
        writeFileSync(join(issueRoot, "a1b2c-other-title.md"), issueDocument("a1b2c", "Other title"), "utf8");
      }
      return uuid;
    });

    expect(result.id).toBe("d3e4f");
    await expect(readFile(join(issueRoot, "a1b2c-other-title.md"), "utf8")).resolves.toContain("# Other title");
    await expect(readFile(join(issueRoot, "d3e4f-raced-title.md"), "utf8")).resolves.toContain("# Raced title");
  });

  it("writes default priority, labels, parent, and blocked_by into new Issue front matter", async () => {
    const root = await createTmpRoot();

    const created = await createIssueFile(root, "默认字段", false);

    const content = await readFile(join(root, created.relativePath), "utf8");
    expect(content).toContain("priority: medium");
    expect(content).toContain("labels: []");
    expect(content).toContain("parent: null");
    expect(content).toContain("blocked_by: []");
    const document = await findIssueDocument(root, created.id);
    expect(document.metadata.priority).toBe("medium");
    expect(document.metadata.labels).toEqual([]);
    expect(document.metadata.parent).toBeNull();
    expect(document.metadata.blocked_by).toEqual([]);
  });

  it("reports an unclosed fenced code block instead of misleading missing sections", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const nested = issueDocument("a1b2c", "Nested fence").replace(
      "Defined.\n\n## Non-goals",
      "```text\nouter\n\n```bash\ninner\n```\n\nTail opens a new fence by accident.\n\n```\n\n## Non-goals"
    );
    await writeFile(join(issueRoot, "a1b2c-nested-fence.md"), nested, "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings.some((finding) => finding.includes("unclosed fenced code block"))).toBe(true);
    expect(findings.some((finding) => finding.includes("missing required section"))).toBe(false);
  });

  it("accepts nested fences when the outer fence is longer", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const nested = issueDocument("a1b2c", "Long outer fence").replace(
      "Defined.\n\n## Non-goals",
      "````text\nouter\n\n```bash\ninner\n```\n\nDone.\n````\n\n## Non-goals"
    );
    await writeFile(join(issueRoot, "a1b2c-long-outer-fence.md"), nested, "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toEqual([]);
  });

  it("reports an Issue whose priority is not in the enum", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const invalid = issueDocument("a1b2c", "Invalid priority").replace("status: open", "status: open\npriority: urgent");
    await writeFile(join(issueRoot, "a1b2c-invalid-priority.md"), invalid, "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toContain("docs/issues/a1b2c-invalid-priority.md: priority must be critical, high, medium, or low.");
  });

  it("reports parent and blocked_by references to missing Issues", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const broken = issueDocument("a1b2c", "Broken refs").replace(
      "status: open",
      "status: open\nparent: ffff1\nblocked_by:\n  - ffff2"
    );
    await writeFile(join(issueRoot, "a1b2c-broken-refs.md"), broken, "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toContain("docs/issues/a1b2c-broken-refs.md: parent references unknown Issue ffff1.");
    expect(findings).toContain("docs/issues/a1b2c-broken-refs.md: blocked_by references unknown Issue ffff2.");
  });

  it("accepts parent and blocked_by references to existing Issues", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-target.md"), issueDocument("a1b2c", "Target"), "utf8");
    const linked = issueDocument("d3e4f", "Linked refs").replace(
      "status: open",
      "status: open\nparent: a1b2c\nblocked_by:\n  - a1b2c"
    );
    await writeFile(join(issueRoot, "d3e4f-linked-refs.md"), linked, "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toEqual([]);
  });

  it("records the anchored design section in the Issue front matter", async () => {
    const root = await createTmpRoot();

    const anchored = await createIssueFile(root, "锚定章节", false, undefined, { section: "架构" });
    const plain = await createIssueFile(root, "无章节", false);

    const anchoredContent = await readFile(join(root, anchored.relativePath), "utf8");
    expect(anchoredContent).toContain("design_section: 架构");
    const document = await findIssueDocument(root, anchored.id);
    expect(document.metadata.design_section).toBe("架构");

    const plainContent = await readFile(join(root, plain.relativePath), "utf8");
    expect(plainContent).not.toContain("design_section");
  });

  it("reports duplicate IDs after parallel Issue files are merged", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-first.md"), issueDocument("a1b2c", "First"), "utf8");
    await writeFile(join(issueRoot, "a1b2c-second.md"), issueDocument("a1b2c", "Second"), "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toContain("duplicate Issue id a1b2c: docs/issues/a1b2c-first.md, docs/issues/a1b2c-second.md.");
  });

  it("reports duplicate IDs across the flat layer and the closed archive", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(join(issueRoot, "closed"), { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-first.md"), issueDocument("a1b2c", "First"), "utf8");
    await writeFile(join(issueRoot, "closed", "a1b2c-second.md"), issueDocument("a1b2c", "Second"), "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toContain("duplicate Issue id a1b2c: docs/issues/a1b2c-first.md, docs/issues/closed/a1b2c-second.md.");
  });

  it("reports terminal Issues in the flat layer and active Issues under closed/", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(join(issueRoot, "closed"), { recursive: true });
    const closed = issueDocument("a1b2c", "Archived")
      .replace("status: open", 'status: closed\nstarted_at: "2026-07-21T00:00:00Z"\nclosed_at: "2026-07-21T01:00:00Z"')
      .replace("- [ ] Defined.", "- [x] Defined.")
      .replace("Pending.", "Implemented.")
      .replace("Pending.", "Verified.");
    await writeFile(join(issueRoot, "a1b2c-archived.md"), closed, "utf8");
    await writeFile(join(issueRoot, "closed", "d3e4f-active.md"), issueDocument("d3e4f", "Active"), "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toContain("docs/issues/a1b2c-archived.md: closed Issue must be archived under docs/issues/closed/.");
    expect(findings).toContain("docs/issues/closed/d3e4f-active.md: active Issue must live directly under docs/issues/.");
  });

  it("reports invalid YAML instead of silently accepting malformed metadata", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-invalid.md"), "---\nid: [\n---\n\n# Invalid\n", "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings[0]).toContain("docs/issues/a1b2c-invalid.md: invalid YAML Front Matter");
  });

  it("reports a closed Issue whose acceptance evidence is incomplete", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const incomplete = issueDocument("a1b2c", "Incomplete").replace(
      "status: open",
      'status: closed\nstarted_at: "2026-07-21T00:00:00Z"\nclosed_at: "2026-07-21T01:00:00Z"'
    );
    await writeFile(join(issueRoot, "a1b2c-incomplete.md"), incomplete, "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toContain(
      "docs/issues/a1b2c-incomplete.md: Issue a1b2c cannot close: every Acceptance Criteria item must be checked."
    );
  });

  it("reports disabled YAML aliases as an invalid document", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const aliased = issueDocument("a1b2c", "Aliased")
      .replace('created_at: "2026-07-21T00:00:00Z"', 'created_at: &time "2026-07-21T00:00:00Z"')
      .replace('updated_at: "2026-07-21T00:00:00Z"', "updated_at: *time");
    await writeFile(join(issueRoot, "a1b2c-aliased.md"), aliased, "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings[0]).toContain("docs/issues/a1b2c-aliased.md: invalid YAML Front Matter");
  });

  it("ignores Markdown headings inside fenced code blocks", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues", "closed");
    await mkdir(issueRoot, { recursive: true });
    const withExample = issueDocument("a1b2c", "Fenced example")
      .replace(
        "status: open",
        'status: closed\nstarted_at: "2026-07-21T00:00:00Z"\nclosed_at: "2026-07-21T01:00:00Z"'
      )
      .replace(
        "Defined.\n\n## Scope",
        "Defined.\n\n```md\n# Fake title\n## Example\n```\n\n## Scope"
      )
      .replace("- [ ] Defined.", "- [x] Defined.\n\n~~~md\n  + [ ] Not an acceptance item\n~~~")
      .replace("Pending.", "Implemented.")
      .replace("Pending.", "Verified.");
    await writeFile(join(issueRoot, "a1b2c-fenced-example.md"), withExample, "utf8");

    await expect(inspectIssueDocuments(root)).resolves.toEqual([]);
  });

  it("allows lowercase todo and pending words in ready and closable evidence", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const content = issueDocument("a1b2c", "Todo application")
      .replace("Defined.\n\n## Scope", "The pic-todo application keeps todo items.\n\n## Scope")
      .replace("Defined.\n\n## Non-goals", "The pending state is a valid business value.\n\n## Non-goals")
      .replace("- [ ] Defined.", "- [x] The todo and pending behavior is verified.")
      .replace("Pending.\n\n## Verification", "Implemented the Pic Todo workflow.\n\n## Verification")
      .replace("Pending.\n\n## Related ADRs", "Verified pic-todo-sync.json and pending transitions.\n\n## Related ADRs")
      .replace(
        "status: open",
        'status: in-progress\nstarted_at: "2026-07-21T00:00:00Z"'
      );
    await writeFile(join(issueRoot, "a1b2c-todo-application.md"), content, "utf8");
    const issue = await findIssueDocument(root, "a1b2c");

    expect(() => assertIssueReady(issue)).not.toThrow();
    expect(() => assertIssueClosable(issue)).not.toThrow();
  });

  it("ignores TODO and Pending inside inline and fenced code during lifecycle validation", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const content = issueDocument("a1b2c", "Code examples")
      .replace("Defined.\n\n## Scope", "Use `TODO`, ``Pending `state` ``, and the example below.\n\n```ts\nconst state = \"Pending\"; // TODO\n```\n\n## Scope")
      .replace("- [ ] Defined.", "- [x] Inline `TODO` and fenced `Pending` examples remain valid.")
      .replace("Pending.\n\n## Verification", "Implemented parser behavior with `TODO`.\n\n## Verification")
      .replace("Pending.\n\n## Related ADRs", "```text\nTODO\nPending\n```\n\nVerified code examples.\n\n## Related ADRs")
      .replace(
        "status: open",
        'status: in-progress\nstarted_at: "2026-07-21T00:00:00Z"'
      );
    await writeFile(join(issueRoot, "a1b2c-code-examples.md"), content, "utf8");
    const issue = await findIssueDocument(root, "a1b2c");

    expect(() => assertIssueReady(issue)).not.toThrow();
    expect(() => assertIssueClosable(issue)).not.toThrow();
  });

  it.each([
    ["TODO", "Background"],
    ["- TODO", "Scope"],
    ["- [ ] TODO", "Acceptance Criteria"]
  ])("rejects the real placeholder %s in %s", async (placeholder, section) => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    let content = issueDocument("a1b2c", "Placeholder issue");
    if (section === "Background") {
      content = content.replace("Defined.\n\n## Scope", `${placeholder}\n\n## Scope`);
    } else if (section === "Scope") {
      content = content.replace("Defined.\n\n## Non-goals", `${placeholder}\n\n## Non-goals`);
    } else {
      content = content.replace("- [ ] Defined.", placeholder);
    }
    await writeFile(join(issueRoot, "a1b2c-placeholder-issue.md"), content, "utf8");

    const issue = await findIssueDocument(root, "a1b2c");
    expect(() => assertIssueReady(issue)).toThrow("Issue a1b2c is not ready");
  });

  it("rejects standalone Pending evidence when closing", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    const content = issueDocument("a1b2c", "Pending evidence")
      .replace("- [ ] Defined.", "- [x] Defined.")
      .replace(
        "status: open",
        'status: in-progress\nstarted_at: "2026-07-21T00:00:00Z"'
      );
    await writeFile(join(issueRoot, "a1b2c-pending-evidence.md"), content, "utf8");
    const issue = await findIssueDocument(root, "a1b2c");

    expect(() => assertIssueClosable(issue)).toThrow("Implementation must contain evidence");
  });

  it("keeps the original Issue intact when a rename destination already exists", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-old-title.md"), issueDocument("a1b2c", "Old title"), "utf8");
    const issue = await findIssueDocument(root, "a1b2c");
    await writeFile(join(issueRoot, "a1b2c-new-title.md"), "occupied\n", "utf8");

    await expect(renameIssueDocument(issue, "New title")).rejects.toThrow("Issue path already exists");
    await expect(readFile(join(issueRoot, "a1b2c-old-title.md"), "utf8")).resolves.toContain("# Old title");
    await expect(readFile(join(issueRoot, "a1b2c-new-title.md"), "utf8")).resolves.toBe("occupied\n");
  });

  it("accepts an Issue document with an Attachments section and matching assets", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(join(issueRoot, "assets", "a1b2c"), { recursive: true });
    await writeFile(join(issueRoot, "assets", "a1b2c", "screen.png"), "png", "utf8");
    const withAttachments = issueDocument("a1b2c", "With attachments").replace(
      "## Related ADRs",
      "## Attachments\n\n- [screen.png](assets/a1b2c/screen.png)\n\n## Related ADRs"
    );
    await writeFile(join(issueRoot, "a1b2c-with-attachments.md"), withAttachments, "utf8");

    await expect(inspectIssueDocuments(root)).resolves.toEqual([]);
  });

  it("reports assets directories without a matching Issue", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(join(issueRoot, "assets", "d3e4f"), { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-first.md"), issueDocument("a1b2c", "First"), "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toEqual(["docs/issues/assets/d3e4f: no Issue with id d3e4f exists."]);
  });

  it("reports assets entries that are not Issue ID directories", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(join(issueRoot, "assets", "Screenshots"), { recursive: true });
    await writeFile(join(issueRoot, "assets", "loose.png"), "png", "utf8");
    await writeFile(join(issueRoot, "a1b2c-first.md"), issueDocument("a1b2c", "First"), "utf8");

    const findings = await inspectIssueDocuments(root);

    expect(findings).toContain("docs/issues/assets/Screenshots: assets entries must be directories named by a five-character Issue ID.");
    expect(findings).toContain("docs/issues/assets/loose.png: assets entries must be directories named by a five-character Issue ID.");
  });

  it("copies attachments under assets/<id> and links them before Related ADRs", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-first.md"), issueDocument("a1b2c", "First"), "utf8");
    await writeFile(join(root, "trace.log"), "trace", "utf8");
    const issue = await findIssueDocument(root, "a1b2c");

    const result = await attachIssueFiles(issue, [join(root, "trace.log")]);

    expect(result.relativePaths).toEqual(["docs/issues/assets/a1b2c/trace.log"]);
    await expect(readFile(join(issueRoot, "assets", "a1b2c", "trace.log"), "utf8")).resolves.toBe("trace");
    const saved = await findIssueDocument(root, "a1b2c");
    expect(saved.body).toContain("## Attachments\n\n- [trace.log](assets/a1b2c/trace.log)\n\n## Related ADRs");
  });

  it("keeps a single link when the same attachment is added twice", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-first.md"), issueDocument("a1b2c", "First"), "utf8");
    await writeFile(join(root, "trace.log"), "v2", "utf8");

    await attachIssueFiles(await findIssueDocument(root, "a1b2c"), [join(root, "trace.log")]);
    await attachIssueFiles(await findIssueDocument(root, "a1b2c"), [join(root, "trace.log")]);

    const saved = await findIssueDocument(root, "a1b2c");
    expect(saved.body.match(/trace\.log/g)).toHaveLength(2);
  });

  it("rejects attachment sources that do not exist without changing the Issue", async () => {
    const root = await createTmpRoot();
    const issueRoot = join(root, "docs", "issues");
    await mkdir(issueRoot, { recursive: true });
    await writeFile(join(issueRoot, "a1b2c-first.md"), issueDocument("a1b2c", "First"), "utf8");
    const issue = await findIssueDocument(root, "a1b2c");

    await expect(attachIssueFiles(issue, [join(root, "missing.png")])).rejects.toThrow("Attachment source not found");
    await expect(readFile(join(issueRoot, "a1b2c-first.md"), "utf8")).resolves.not.toContain("## Attachments");
  });

  it("inserts attachment links before Related ADRs and appends to an existing section", () => {
    const body = "# Example\n\n```md\n## Related ADRs\n```\n\n## Related ADRs\n\n- None.";
    const linked = addIssueAttachmentLinks(body, ["- [a.png](assets/a1b2c/a.png)"]);

    expect(linked).toBe("# Example\n\n```md\n## Related ADRs\n```\n\n## Attachments\n\n- [a.png](assets/a1b2c/a.png)\n\n## Related ADRs\n\n- None.");
    expect(addIssueAttachmentLinks(linked, ["- [a.png](assets/a1b2c/a.png)", "- [b.png](assets/a1b2c/b.png)"])).toBe(
      "# Example\n\n```md\n## Related ADRs\n```\n\n## Attachments\n\n- [a.png](assets/a1b2c/a.png)\n- [b.png](assets/a1b2c/b.png)\n\n## Related ADRs\n\n- None."
    );
  });

  it("adds cancellation before the real Related ADRs heading", () => {
    const body = "# Example\n\n```md\n## Related ADRs\n```\n\n## Related ADRs\n\n- None.";

    expect(addCancellationSection(body, "Keep $& literal")).toBe(
      "# Example\n\n```md\n## Related ADRs\n```\n\n## Cancellation\n\nReason: Keep $& literal\n\n## Related ADRs\n\n- None."
    );
    expect(addCancellationSection(body, "## Not a section")).toContain("## Cancellation\n\nReason: ## Not a section");
  });
});

async function createTmpRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "isa-issues-"));
  tmpRoots.push(root);
  return root;
}

function issueDocument(id: string, title: string): string {
  return [
    "---",
    `id: ${id}`,
    "status: open",
    'created_at: "2026-07-21T00:00:00Z"',
    'updated_at: "2026-07-21T00:00:00Z"',
    "---",
    "",
    `# ${title}`,
    "",
    "## Background",
    "",
    "Defined.",
    "",
    "## Scope",
    "",
    "Defined.",
    "",
    "## Non-goals",
    "",
    "None.",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] Defined.",
    "",
    "## Implementation",
    "",
    "Pending.",
    "",
    "## Verification",
    "",
    "Pending.",
    "",
    "## Related ADRs",
    "",
    "- None.",
    ""
  ].join("\n");
}
