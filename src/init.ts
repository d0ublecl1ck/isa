// Issues-as-Code init — bootstrap docs/issues/ and enforce the AGENTS.md constraint, idempotently.
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const AGENTS_CONSTRAINT =
  "Agent 必须使用我们当前平台(ISA,Issues-as-Code CLI)实现 issues as code 并实践它,这是一个强制要求。";

const AGENTS_MARKER = "<!-- isa:agents-constraint -->";

const AGENTS_SECTION = `${AGENTS_MARKER}
## Issues-as-Code (mandatory)

${AGENTS_CONSTRAINT}

- Issue 文档存放在 \`docs/issues/\`:变更前先 \`isa new\` / \`isa start\`,完成后 \`isa close\`。
- 每个非合并提交必须携带恰好一个 \`Issue: <id>\` trailer。
`;

export interface InitCommandArgs {
  targetRoot?: string;
  dryRun?: boolean;
}

export async function runInitCommand(args: InitCommandArgs): Promise<string> {
  const root = resolve(args.targetRoot ?? ".");
  const rootStat = await stat(root).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!rootStat?.isDirectory()) {
    throw new Error(`init target root does not exist or is not a directory: ${args.targetRoot ?? "."}`);
  }

  const lines: string[] = [];
  const issueRoot = join(root, "docs", "issues");
  const issueRootStat = existsSync(issueRoot) ? await stat(issueRoot) : undefined;
  if (issueRootStat) {
    if (!issueRootStat.isDirectory()) {
      throw new Error(`init cannot create docs/issues/: ${issueRoot} already exists and is not a directory.`);
    }
    lines.push("exists docs/issues/");
  } else {
    lines.push(`${args.dryRun ? "dry-run create" : "created"} docs/issues/`);
    if (!args.dryRun) {
      try {
        await mkdir(issueRoot, { recursive: true });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`init failed to create docs/issues/ under ${root}: ${detail}`);
      }
    }
  }

  const agentsPath = join(root, "AGENTS.md");
  const agentsStat = existsSync(agentsPath) ? await stat(agentsPath) : undefined;
  if (agentsStat && !agentsStat.isFile()) {
    throw new Error(`init cannot update AGENTS.md: ${agentsPath} already exists and is not a file.`);
  }
  const existing = agentsStat ? await readFile(agentsPath, "utf8") : undefined;
  if (existing?.includes(AGENTS_MARKER)) {
    lines.push("exists AGENTS.md (constraint already present)");
  } else if (existing !== undefined) {
    lines.push(`${args.dryRun ? "dry-run update" : "updated"} AGENTS.md`);
    if (!args.dryRun) {
      const separator = existing.endsWith("\n") ? "\n" : "\n\n";
      await writeFile(agentsPath, `${existing}${separator}${AGENTS_SECTION}`, "utf8");
    }
  } else {
    lines.push(`${args.dryRun ? "dry-run create" : "created"} AGENTS.md`);
    if (!args.dryRun) {
      await writeFile(agentsPath, `# AGENTS.md\n\n${AGENTS_SECTION}`, "utf8");
    }
  }

  return lines.join("\n");
}
