# Proposal: converge-readme-releasing-relocate-release-setup

## Why

README 的 `### Releasing` 段落是从发布者视角撰写的：详述了发布机制（Version Packages PR、手动 `beta` 预发布 dispatch），并把读者引向 `.github/RELEASE-SETUP.md` 中的一次性凭据配置。面向社区的 README 不应携带维护者的凭据配置指导。与此同时，`.github/RELEASE-SETUP.md` 是一份面向维护者的一次性清单（截至 2026-08-22 已全部完成），却放在面向贡献者的 `.github/` 目录中。这是 TASK-32 评审（Multica TASK-38）经用户批准的结论。

## What Changes

- 将 README 的 `### Releasing` 段落改写为简短的面向社区说明：发布通过 Changesets 自动化，合并自动生成的 version PR 即发布到 npm。移除凭据配置指导与指向该清单的链接；语气与相邻段落保持一致。
- 将 `.github/RELEASE-SETUP.md` 移动到 `docs/release-setup.md`，并在文档顶部添加面向维护者的提示。
- 将仓库内所有对 `./.github/RELEASE-SETUP.md` 的引用更新为新位置（`docs/issues/closed/` 下的历史记录保持不动）。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- 无。本变更为纯文档变更：不涉及 CLI 行为、命令界面或 requirement 变化，因此按 spec-driven schema 对纯文档变更的指导，本 change 在 `.openspec.yaml` 中设置 `skip_specs: true`。

## Impact

- **文档**：`README.md`（Releasing 段落）、`.github/RELEASE-SETUP.md` → `docs/release-setup.md`。
- **仓库工具链**：本分支同时为本项目引入 OpenSpec（`openspec/` init 产物）作为今后的变更管理流程。
- **无运行时影响**：`src/`、`.github/workflows/` 与 `.changeset/` 均未改动；发布自动化本身不变。
