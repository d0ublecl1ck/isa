// Init command tests: docs/issues bootstrap and AGENTS.md constraint, idempotent and dry-run safe.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS_CONSTRAINT, runInitCommand } from "./init.js";

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tmpRoots.map((root) => rm(root, { recursive: true, force: true })));
  tmpRoots.length = 0;
});

async function createTmpRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "isa-init-"));
  tmpRoots.push(root);
  return root;
}

describe("runInitCommand", () => {
  it("creates docs/issues/ and a new AGENTS.md with the mandatory constraint", async () => {
    const root = await createTmpRoot();

    const output = await runInitCommand({ targetRoot: root });

    expect(output).toContain("created docs/issues/");
    expect(output).toContain("created AGENTS.md");
    expect(existsSync(join(root, "docs", "issues"))).toBe(true);
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain(AGENTS_CONSTRAINT);
  });

  it("appends the constraint to an existing AGENTS.md without touching prior content", async () => {
    const root = await createTmpRoot();
    const prior = "# Team Rules\n\n- Use pnpm.\n";
    await writeFile(join(root, "AGENTS.md"), prior, "utf8");

    const output = await runInitCommand({ targetRoot: root });

    expect(output).toContain("created docs/issues/");
    expect(output).toContain("updated AGENTS.md");
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents.startsWith(prior)).toBe(true);
    expect(agents).toContain(AGENTS_CONSTRAINT);
  });

  it("creates AGENTS.md when docs/issues/ already exists", async () => {
    const root = await createTmpRoot();
    await mkdir(join(root, "docs", "issues"), { recursive: true });

    const output = await runInitCommand({ targetRoot: root });

    expect(output).toContain("exists docs/issues/");
    expect(output).toContain("created AGENTS.md");
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain(AGENTS_CONSTRAINT);
  });

  it("creates docs/issues/ and updates AGENTS.md when only AGENTS.md exists", async () => {
    const root = await createTmpRoot();
    const prior = "# Team Rules\n";
    await writeFile(join(root, "AGENTS.md"), prior, "utf8");

    const output = await runInitCommand({ targetRoot: root });

    expect(output).toContain("created docs/issues/");
    expect(output).toContain("updated AGENTS.md");
    expect(existsSync(join(root, "docs", "issues"))).toBe(true);
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents.startsWith(prior)).toBe(true);
    expect(agents).toContain(AGENTS_CONSTRAINT);
  });

  it("separates the appended section when AGENTS.md has no trailing newline", async () => {
    const root = await createTmpRoot();
    const prior = "# Team Rules\n\n- Use pnpm.";
    await writeFile(join(root, "AGENTS.md"), prior, "utf8");

    const output = await runInitCommand({ targetRoot: root });

    expect(output).toContain("updated AGENTS.md");
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents.startsWith(`${prior}\n\n`)).toBe(true);
    expect(agents).toContain(AGENTS_CONSTRAINT);
  });

  it("is idempotent when docs/issues/ and the constraint already exist", async () => {
    const root = await createTmpRoot();

    await runInitCommand({ targetRoot: root });
    const firstAgents = await readFile(join(root, "AGENTS.md"), "utf8");
    const output = await runInitCommand({ targetRoot: root });

    expect(output).toContain("exists docs/issues/");
    expect(output).toContain("exists AGENTS.md");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(firstAgents);
  });

  it("announces create vs update in dry-run mode without writing anything", async () => {
    const root = await createTmpRoot();

    const output = await runInitCommand({ targetRoot: root, dryRun: true });

    expect(output).toContain("dry-run create docs/issues/");
    expect(output).toContain("dry-run create AGENTS.md");
    expect(existsSync(join(root, "docs", "issues"))).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);

    await writeFile(join(root, "AGENTS.md"), "# Team Rules\n", "utf8");
    const updateOutput = await runInitCommand({ targetRoot: root, dryRun: true });
    expect(updateOutput).toContain("dry-run create docs/issues/");
    expect(updateOutput).toContain("dry-run update AGENTS.md");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("# Team Rules\n");
  });

  it("fails when the target root does not exist", async () => {
    const root = await createTmpRoot();

    await expect(runInitCommand({ targetRoot: join(root, "missing") })).rejects.toThrow(
      /init target root does not exist/
    );
  });

  it("translates mkdir failures into a friendly error when docs/ is a regular file", async () => {
    const root = await createTmpRoot();
    await writeFile(join(root, "docs"), "not a directory", "utf8");

    await expect(runInitCommand({ targetRoot: root })).rejects.toThrow(
      /init failed to create docs\/issues\/ under/
    );
  });

  it("fails clearly when docs/issues exists as a regular file", async () => {
    const root = await createTmpRoot();
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "issues"), "not a directory", "utf8");

    await expect(runInitCommand({ targetRoot: root })).rejects.toThrow(
      /already exists and is not a directory/
    );
  });

  it("fails clearly when AGENTS.md exists as a directory", async () => {
    const root = await createTmpRoot();
    await mkdir(join(root, "AGENTS.md"), { recursive: true });

    await expect(runInitCommand({ targetRoot: root })).rejects.toThrow(
      /AGENTS\.md.*already exists and is not a file/
    );
  });
});
