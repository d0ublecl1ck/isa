// CLI tests: flag parsing, command dispatch, check exit codes, and version source.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs, runCli } from "./cli.js";

const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tmpRoots.map((root) => rm(root, { recursive: true, force: true })));
  tmpRoots.length = 0;
});

async function createTmpRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "isa-cli-"));
  tmpRoots.push(root);
  return root;
}

describe("parseArgs", () => {
  it("parses the action and positional values", () => {
    const parsed = parseArgs(["new", "Add", "traceability"]);
    expect(parsed.action).toBe("new");
    expect(parsed.values).toEqual(["Add", "traceability"]);
  });

  it("parses every supported flag", () => {
    const parsed = parseArgs([
      "close", "a1b2c",
      "-t", "/tmp/root",
      "--status", "closed",
      "--offset", "3",
      "--limit", "50",
      "--base", "origin/main",
      "--section", "数据模型",
      "--file", "src/app.ts",
      "--line", "12",
      "--dry-run",
      "--prepare",
      "--pull",
      "--force"
    ]);
    expect(parsed).toMatchObject({
      action: "close",
      values: ["a1b2c"],
      targetRoot: "/tmp/root",
      status: "closed",
      offset: 3,
      limit: 50,
      base: "origin/main",
      section: "数据模型",
      targetFile: "src/app.ts",
      line: 12,
      dryRun: true,
      prepare: true,
      pull: true,
      force: true
    });
  });

  it("parses --target as an alias of -t", () => {
    expect(parseArgs(["check", "--target", "/tmp/x"]).targetRoot).toBe("/tmp/x");
  });

  it("rejects unknown commands with a helpful message", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow('Unknown command "frobnicate". Run "isa --help" for usage.');
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["list", "--bogus"])).toThrow('Unsupported flag "--bogus".');
  });

  it("rejects non-integer numeric flags", () => {
    expect(() => parseArgs(["list", "--limit", "1.5"])).toThrow("--limit requires an integer.");
    expect(() => parseArgs(["trace", "--file", "a.ts", "--line", "x"])).toThrow("--line requires an integer.");
  });

  it("rejects flags missing a value", () => {
    expect(() => parseArgs(["show", "a1b2c", "-t"])).toThrow("-t requires a value.");
  });
});

describe("runCli", () => {
  it("reads the version from package.json", async () => {
    const result = await runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prints help with exit code 0 for --help and 1 for no command", async () => {
    const help = await runCli(["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.output).toContain("Usage:");
    const none = await runCli([]);
    expect(none.exitCode).toBe(1);
    expect(none.output).toBe(help.output);
  });

  it("dispatches issue commands through the full pipeline", async () => {
    const root = await createTmpRoot();
    const created = await runCli(["new", "Add", "traceability", "-t", root]);
    expect(created.exitCode).toBe(0);
    expect(created.output).toMatch(/^created docs\/issues\/[0-9a-f]{5}-add-traceability\.md\nIssue: [0-9a-f]{5}$/);
    const listed = await runCli(["list", "-t", root, "--status", "all"]);
    expect(listed.exitCode).toBe(0);
    expect(listed.output).toContain("add-traceability.md");
  });

  it("check reports a missing target root as an error", async () => {
    await expect(runCli(["check", "-t", join(tmpdir(), "isa-cli-nonexistent-root")])).rejects.toThrow(/does not exist/);
  });

  it("check passes an empty repository without docs/issues/", async () => {
    const root = await createTmpRoot();
    const result = await runCli(["check", "-t", root]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("nothing to check");
  });

  it("check validates documents and fails with exit code 1 on errors", async () => {
    const root = await createTmpRoot();
    expect((await runCli(["new", "Valid issue", "-t", root])).exitCode).toBe(0);
    expect(await runCli(["check", "-t", root])).toEqual({
      output: "All Issues-as-Code documents are valid.",
      exitCode: 0
    });

    await mkdir(join(root, "docs", "issues"), { recursive: true });
    await writeFile(join(root, "docs", "issues", "bad-doc.md"), "# no front matter\n", "utf8");
    const broken = await runCli(["check", "-t", root]);
    expect(broken.exitCode).toBe(1);
    expect(broken.output).toContain("missing YAML Front Matter");
  });

  it("check rejects positional arguments", async () => {
    await expect(runCli(["check", "extra"])).rejects.toThrow("check takes no positional arguments.");
  });

  it("init bootstraps docs/issues/ and AGENTS.md end to end", async () => {
    const root = await createTmpRoot();
    const result = await runCli(["init", "-t", root]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("created docs/issues/");
    expect(result.output).toContain("created AGENTS.md");

    const rerun = await runCli(["init", "-t", root]);
    expect(rerun.output).toContain("exists docs/issues/");
    expect(rerun.output).toContain("exists AGENTS.md");
  });

  it("init rejects positional arguments", async () => {
    await expect(runCli(["init", "extra"])).rejects.toThrow("init takes no positional arguments.");
  });
});
