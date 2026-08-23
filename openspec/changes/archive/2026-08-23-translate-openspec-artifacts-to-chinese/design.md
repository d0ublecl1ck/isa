# Design: translate-openspec-artifacts-to-chinese

## Context

`main`（HEAD `cd7d905`）上的 OpenSpec 产物核实清单：

- `openspec/config.yaml`：`schema: spec-driven` 键值 + 三段英文注释（project context、per-artifact rules、per-operation guidance 的说明与示例）。
- `openspec/changes/archive/2026-08-23-converge-readme-releasing-relocate-release-setup/`：`proposal.md`（27 行）、`design.md`（31 行）、`tasks.md`（21 行）为英文；`.openspec.yaml` 为机器配置。
- `openspec/specs/` 不存在（唯一的历史 change 为纯文档改动，归档时无 spec delta 落盘）。

动机见 proposal.md — Why。

## Goals / Non-Goals

**Goals:**

- 上述三个 Markdown 文件与 `config.yaml` 注释全部译为中文，正文、标题、列表文字均在翻译范围内。
- 专有名词（OpenSpec、Changesets、README、npm 等）、命令、代码标识符、文件路径、URL、frontmatter 键名保持原文。
- 历史事实（TASK 编号、日期、PR 号、命令与验证结果记录）逐字保留；任务勾选状态（`[x]`）不变。
- 翻译只换语言，不改写内容、不增删语义。

**Non-Goals:**

- 不改目录名、文件名、归档日期前缀。
- 不翻译归档 change 的 `.openspec.yaml`（机器配置）。
- 不翻译 `docs/issues/` 下的 ISA issue 文档（语言规则仅覆盖 OpenSpec 产物）。
- 不触碰 `src/`、`.github/workflows/`、`.changeset/`。

## Decisions

- **逐文件直译，不重组结构**：章节标题、列表层级、加粗与引用块位置与英文原版一一对应，便于 diff 审查时逐段对照；弃用「借翻译顺手优化措辞」——会与「不增删语义」冲突。
- **`.openspec.yaml` 保留原文**：其内容为 `schema` / `created` / `skip_specs` 键值，属机器配置而非面向读者的文档文字；语言规则针对文档产物，键值翻译会破坏 schema。
- **`config.yaml` 只译注释**：YAML 注释是给人看的指引文字，属于语言规则覆盖范围；键值与示例中的配置键名（`context`、`rules`、`operations`、`guidance` 等）保持原文。
- **翻译后校验**：对每个译后文件运行 `openspec validate` 相关命令确认格式未破坏，并 diff 核对非文字行（代码块、路径、URL、frontmatter）零变化。

## Risks / Trade-offs

- [归档历史文档被改写可能削弱「历史原样」语义] → 可接受：语言规则明确要求含归档产物在内的全部 OpenSpec 文档中文化，且用户已在 TASK-43 中批准该范围；历史事实内容逐字保留，仅语言外壳变化。
- [直译可能产生生硬中文] → 通过逐段对照原文复核缓解，允许在不改变语义的前提下调整语序。
