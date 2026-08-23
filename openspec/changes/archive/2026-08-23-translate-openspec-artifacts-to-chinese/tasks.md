# Tasks: translate-openspec-artifacts-to-chinese

## 1. 翻译 `openspec/config.yaml`

- [x] 1.1 将三段注释（project context、per-artifact rules、per-operation guidance 的说明与示例）翻译为中文；`schema: spec-driven` 键值与示例中的配置键名保持原文，diff 核对非注释行零变化。

## 2. 翻译归档 change 文档

- [x] 2.1 翻译 `openspec/changes/archive/2026-08-23-converge-readme-releasing-relocate-release-setup/proposal.md` 为中文，保留全部专有名词、命令、路径与历史事实原文。
- [x] 2.2 翻译同目录 `design.md` 为中文，要求同上。
- [x] 2.3 翻译同目录 `tasks.md` 为中文，任务勾选状态（`[x]`）与编号不变；`.openspec.yaml` 保持原文。

## 3. 验证

- [x] 3.1 `openspec validate translate-openspec-artifacts-to-chinese --strict` 通过（归档前）。
- [x] 3.2 `npm run build`、`npm test`、`npm run typecheck`、`node dist/cli.js check` 全部通过。
- [x] 3.3 diff 核对：译后文件相对英文原版仅文字语言变化，代码块、路径、URL、frontmatter、键值行零变化。
- [x] 3.4 按 TASK-38 先例执行 `openspec archive translate-openspec-artifacts-to-chinese --skip-specs`（随实现 PR 一并完成），归档后 `openspec validate --archived` 通过。
- [x] 3.5 更新 ISA issue `c27a2` 的 Implementation/Verification 段落并勾选验收项，按 ISA 流程 close。
