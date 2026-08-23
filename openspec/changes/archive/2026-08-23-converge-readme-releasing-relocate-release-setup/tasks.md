# Tasks: converge-readme-releasing-relocate-release-setup

## 1. README

- [x] 1.1 将 `README.md` 的 `### Releasing` 段落改写为简短的面向社区说明（1–2 句：Changesets 自动化；合并 version PR 即发布到 npm），移除凭据配置指导与 `./.github/RELEASE-SETUP.md` 链接。

## 2. 迁移维护者文档

- [x] 2.1 `git mv .github/RELEASE-SETUP.md docs/release-setup.md`。
- [x] 2.2 在 `docs/release-setup.md` 顶部添加面向维护者的提示引用块（维护者受众 + 一次性配置已于 2026-08-22 完成）；其余内容保持不变。

## 3. 引用

- [x] 3.1 全仓库 grep `RELEASE-SETUP`，将所有现存引用（排除 `docs/issues/closed/` 历史记录）更新为指向 `docs/release-setup.md`。

## 4. 验证

- [x] 4.1 `npm run build`、`npm test`、`npm run typecheck` 通过。
- [x] 4.2 `node dist/cli.js check` 通过。
- [x] 4.3 `openspec validate converge-readme-releasing-relocate-release-setup --strict` 通过。
- [x] 4.4 更新 ISA issue `581d6` 的 Implementation/Verification 段落与验收勾选框，然后按 ISA 流程 close。
