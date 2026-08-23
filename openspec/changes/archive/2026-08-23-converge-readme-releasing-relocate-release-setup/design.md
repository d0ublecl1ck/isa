# Design: converge-readme-releasing-relocate-release-setup

## Context

`README.md` 第 118–120 行是发布者视角的 `### Releasing` 段落（发布机制加凭据配置指引）。`.github/RELEASE-SETUP.md` 是一份一次性属主侧凭据清单，其状态头已记录「2026-08-22: all complete」。仓库内对该清单的引用仅有 README 链接与 `docs/issues/closed/` 下的历史已关闭 issue 文档。动机见 proposal.md 的 Why。

## Goals / Non-Goals

**目标：**

- README Releasing 段落读起来面向社区：用户/贡献者需要知道的内容（发布已自动化、合并 version PR 即发布），不涉及凭据。
- 清单仍在维护者专属位置对维护者可用，并明确标注其定位，其余内容逐字节不变。
- 移动后零坏链。

**非目标：**

- 改写或精简清单内容本身。
- 改动发布自动化（`.github/workflows/`、`.changeset/`）。
- 回改 `docs/issues/closed/` 中提到旧路径的历史记录——它们按当时的历史原样描述。

## Decisions

- **新位置定为 `docs/release-setup.md`**（小写，符合仓库文档命名约定），而非保留在 `.github/` 或挪进 issue 文档。`.github/` 是面向贡献者的界面（PR 模板、workflows、CODEOWNERS）；已完成的一次性凭据清单属于维护者参考资料，而 `docs/` 是本仓库存放长期文档的位置。曾考虑的替代方案：直接删除该文件——被否决，因为它是重新配置或迁移发布凭据时的 runbook。
- **采用顶部提示块而非 front-matter**：在 `docs/release-setup.md` 顶部放置 `> **Maintainer document** …` 引用块，在任何渲染器中都可见，而不是会被 GitHub 隐藏的 YAML front matter。
- **README 措辞**：一到两句，与相邻段落同一语域，例如「Releases are automated with Changesets: merging the automated `chore(release): version packages` PR publishes the package to npm and creates the GitHub Release.」。不提 beta dispatch 机制或凭据配置——那是维护者关切，不是社区关切。
- **历史引用保留**：`docs/issues/closed/*.md` 中对 `.github/RELEASE-SETUP.md` 的提及是时间点记录，不改写。

## Risks / Trade-offs

- [指向 GitHub 上 `.github/RELEASE-SETUP.md` 的外部深链会失效] → 可能性低（该文件是一次性清单，据我们所知没有外部来源链接）；通过在可发现的 `docs/` 路径保留完整内容缓解。
- [README 丢失部分早期用户使用的 beta 安装提示] → 可接受：beta 是一次性验证渠道，且预发布 workflow 在移动后的维护者文档中仍有记录。
