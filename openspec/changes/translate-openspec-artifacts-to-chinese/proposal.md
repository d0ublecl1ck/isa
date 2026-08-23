# Proposal: translate-openspec-artifacts-to-chinese

## Why

工作区规则已新增语言要求（2026-08-23 用户批准）：任何 OpenSpec 文档（`proposal.md`、`specs/`、`design.md`、`tasks.md` 及 change 目录内其余产物，含归档产物）MUST 全文使用中文撰写，专有名词（OpenSpec、Changesets 等）、命令、代码标识符、文件名保持原文。本仓库 `main`（HEAD `cd7d905`）上的存量 OpenSpec 产物全部为英文，与新规则不一致，需要翻译对齐。

## What Changes

- 将 `openspec/config.yaml` 中的注释与示例文字翻译为中文；`schema: spec-driven` 等键值保持不变。
- 将归档 change `openspec/changes/archive/2026-08-23-converge-readme-releasing-relocate-release-setup/` 的 `proposal.md`、`design.md`、`tasks.md` 翻译为中文；已勾选的任务状态（`[x]`）与历史事实（TASK 编号、日期、PR 号）原样保留。
- 归档 change 的 `.openspec.yaml` 为机器配置（`schema`、`created`、`skip_specs`），保持原文不动。
- 目录名、文件名、归档日期前缀、frontmatter 键名一律不改。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- None. 本 change 为纯文档翻译：不涉及 CLI 行为、命令面或任何 requirement 变化，故按 spec-driven schema 对纯文档改动的指引，在 `.openspec.yaml` 中设置 `skip_specs: true`。

## Impact

- **Docs**：`openspec/config.yaml`、`openspec/changes/archive/2026-08-23-converge-readme-releasing-relocate-release-setup/{proposal,design,tasks}.md`。
- **无运行时影响**：`src/`、`.github/workflows/`、`.changeset/` 均不触碰；翻译不增删语义。
