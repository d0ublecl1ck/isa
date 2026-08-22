#!/usr/bin/env node
// ISA — Issues-as-Code CLI entry point.
import { existsSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runIssueCommand } from "./commands.js";
import { inspectIssueDocuments } from "./issues.js";

const ACTIONS = new Set(["new", "list", "show", "rename", "start", "close", "cancel", "trace", "attach", "sync", "check"]);

const HELP = `ISA — Issues-as-Code CLI. Issue documents live in the repository under docs/issues/ and every non-merge commit carries exactly one "Issue: <id>" trailer.

Usage:
  isa new <title...> [--section <design section>] [-t <path>] [--dry-run]
  isa list [--status <status>] [--offset <n>] [--limit <n>] [-t <path>]
  isa show <id> [-t <path>]
  isa rename <id> <title...> [-t <path>] [--dry-run]
  isa start <id> [-t <path>] [--dry-run]
  isa close <id> [--base <ref>] [--prepare] [-t <path>] [--dry-run]
  isa cancel <id> <reason...> [-t <path>] [--dry-run]
  isa trace <id> [-t <path>]
  isa trace --file <path> --line <number> [-t <path>]
  isa attach <id> <file...> [-t <path>] [--dry-run]
  isa sync [--pull] [--force] [-t <path>]
  isa check [-t <path>]

Options:
  -t, --target <path>   Target repository root (default: current directory).
  --status <status>     Filter list by open, in-progress, closed, cancelled, or all.
  --offset <n>          List offset (default 0).
  --limit <n>           List page size, 1-100 (default 20).
  --file <path>         Source file for trace.
  --line <number>       1-based source line for trace.
  --base <ref>          Git base ref used by close.
  --prepare             Prepare close for a single Issue + Closes commit.
  --section <text>      Anchor a new Issue to a design document section.
  --pull                Pull new GitHub Issues and comments during sync.
  --force               Overwrite manually edited GitHub mirrors during sync.
  --dry-run             Preview without writing.
  -h, --help            Show this help.
  -v, --version         Show the ISA version.

Active documents live under docs/issues/; closed and cancelled ones are archived to docs/issues/closed/ automatically. Attachments live under docs/issues/assets/<id>/. Every non-merge commit must contain exactly one trailer:

  Issue: <id>

Single-commit close: run "isa close <id> --prepare" before committing, then add both trailers to the same commit:

  Issue: <id>
  Closes: <id>

A later "isa close <id>" then only verifies the binding and creates no extra commit.`;

export interface ParsedArgs {
  action?: string;
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
  help?: boolean;
  version?: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { values: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--version" || arg === "-v") {
      parsed.version = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--prepare") {
      parsed.prepare = true;
    } else if (arg === "--pull") {
      parsed.pull = true;
    } else if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "-t" || arg === "--target") {
      parsed.targetRoot = requireValue(argv, ++index, arg);
    } else if (arg === "--status") {
      parsed.status = requireValue(argv, ++index, arg);
    } else if (arg === "--offset") {
      parsed.offset = parseInteger(requireValue(argv, ++index, arg), arg);
    } else if (arg === "--limit") {
      parsed.limit = parseInteger(requireValue(argv, ++index, arg), arg);
    } else if (arg === "--base") {
      parsed.base = requireValue(argv, ++index, arg);
    } else if (arg === "--section") {
      parsed.section = requireValue(argv, ++index, arg);
    } else if (arg === "--file") {
      parsed.targetFile = requireValue(argv, ++index, arg);
    } else if (arg === "--line") {
      parsed.line = parseInteger(requireValue(argv, ++index, arg), arg);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unsupported flag "${arg}".`);
    } else if (parsed.action === undefined && ACTIONS.has(arg)) {
      parsed.action = arg;
    } else if (parsed.action === undefined) {
      throw new Error(`Unknown command "${arg}". Run "isa --help" for usage.`);
    } else {
      parsed.values.push(arg);
    }
  }
  return parsed;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parseInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${flag} requires an integer.`);
  }
  return parsed;
}

async function readVersion(): Promise<string> {
  const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as { version?: string };
  return manifest.version ?? "0.0.0";
}

export interface CliResult {
  output: string;
  exitCode: number;
}

export async function runCli(argv: string[]): Promise<CliResult> {
  const parsed = parseArgs(argv);
  if (parsed.version) {
    return { output: await readVersion(), exitCode: 0 };
  }
  if (parsed.help) {
    return { output: HELP, exitCode: 0 };
  }
  if (parsed.action === undefined) {
    return { output: HELP, exitCode: 1 };
  }
  if (parsed.action === "check") {
    if (parsed.values.length > 0) {
      throw new Error("check takes no positional arguments.");
    }
    const root = resolve(parsed.targetRoot ?? ".");
    const rootStat = await stat(root).catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    if (!rootStat?.isDirectory()) {
      throw new Error(`check target root does not exist or is not a directory: ${parsed.targetRoot ?? "."}`);
    }
    if (!existsSync(join(root, "docs", "issues"))) {
      return { output: "No docs/issues/ directory found; nothing to check.", exitCode: 0 };
    }
    const errors = await inspectIssueDocuments(root);
    if (errors.length > 0) {
      return { output: errors.join("\n"), exitCode: 1 };
    }
    return { output: "All Issues-as-Code documents are valid.", exitCode: 0 };
  }
  const output = await runIssueCommand({
    action: parsed.action,
    values: parsed.values,
    targetRoot: parsed.targetRoot,
    targetFile: parsed.targetFile,
    line: parsed.line,
    status: parsed.status,
    offset: parsed.offset,
    limit: parsed.limit,
    base: parsed.base,
    dryRun: parsed.dryRun,
    prepare: parsed.prepare,
    pull: parsed.pull,
    force: parsed.force,
    section: parsed.section
  });
  return { output, exitCode: 0 };
}

async function main(): Promise<void> {
  try {
    const result = await runCli(process.argv.slice(2));
    if (result.exitCode === 0) {
      console.log(result.output);
    } else {
      console.error(result.output);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedAsScript = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  void main();
}
