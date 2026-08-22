# 发布流程与配置清单

ISA 的发布流程移植自 [OpenSpec](https://github.com/Fission-AI/OpenSpec)，基于 **Changesets + GitHub Actions + npm OIDC trusted publishing**（无需 npm token）。

## 日常流程

1. 开发 PR 中包含用户可见变更时，运行 `npx changeset` 添加一个 changeset 文件（`.changeset/*.md`），随 PR 一起提交。CI 的 `Validate Release Tracking` job 会校验。
2. PR 合并进 `main` 后，`Release` workflow（`.github/workflows/release.yml`）的 `prepare` job 自动开启/更新 **"chore(release): version packages"** PR。
3. 合并该 Version PR 后，同一 workflow 执行 `npm run release:ci`（即 `changeset publish`），通过 npm OIDC trusted publishing 发布到 npm，并自动创建 GitHub Release。
4. 手动触发 beta 预发布：Actions → Release → Run workflow（从 `main`）。按 pending changesets 计算下一个稳定版本号加 `-beta.N` 后缀，发布到 npm 的 `beta` dist-tag 并创建 prerelease 标记的 GitHub Release。安装：`npm install -g @d0ublecl1ck/isa-cli@beta`。

## 一次性凭据配置清单（仓库 owner 完成）

> **状态（2026-08-22）：全部完成。** 仓库已推送至 `d0ublecl1ck/isa`，GitHub App、分支保护、npm 首发（0.1.0）与 Trusted Publisher 连接均已就绪，beta OIDC 发布链路已验证。以下步骤留作重新配置或迁移时的参考。

代码已落地，以下配置需要在 GitHub / npm 侧手动完成，发布流程才能工作。先创建并推送 `d0ublecl1ck/isa`，再做以下设置。

### 1. npm OIDC trusted publishing（必需）

在 npmjs.com 为 `@d0ublecl1ck/isa-cli` 包配置 Trusted Publisher。该 scoped 包必须由 `d0ublecl1ck` 账号或其所属组织拥有：

- 进入 https://www.npmjs.com/package/@d0ublecl1ck/isa-cli/access → **Trusted Publishers**。
- 若包尚未发布，先使用官方 registry 手动发布首版：

  ```bash
  npm login --registry=https://registry.npmjs.org
  npm publish --access public --registry=https://registry.npmjs.org
  ```

- 添加 **GitHub Actions** trusted publisher：
  - Organization/user: `d0ublecl1ck`
  - Repository: `isa`
  - Workflow filename: `release.yml`（只填文件名，不填 `.github/workflows/`；授权按文件名匹配）
  - Environment: 留空
  - Allowed action（若页面出现）: `npm publish`
- 配置后不需要 `NPM_TOKEN`；workflow 中的 `id-token: write` 已满足 OIDC 认证。

### 2. GitHub App（必需，用于 Version Packages PR）

`GITHUB_TOKEN` 触发的 git 操作无法再触发后续 CI，因此需要 GitHub App token：

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**。
2. 创建时：
   - Homepage URL 可填 `https://github.com/d0ublecl1ck/isa`；Callback URL 留空。
   - 不需要 webhook 时关闭 **Active**。
   - Repository permissions：`Contents: Read & write`、`Pull requests: Read & write`；其他权限保持 `No access`，`Metadata` 保持默认只读。
   - 选择仅允许安装到当前账号（私有 App）。
3. 创建后记录数字 **App ID**（不是 Client ID），点击 **Generate a private key** 下载 `.pem` 文件。
4. App 页面点击 **Install App**：选择 `d0ublecl1ck` → **Only select repositories** → `isa` → Install。
5. 仓库 Settings → **Secrets and variables → Actions**：
   - **Variables** → New repository variable：`APP_ID` = 数字 App ID。
   - **Secrets** → New repository secret：`APP_PRIVATE_KEY` = `.pem` 文件全文，包含 `BEGIN/END` 行。

### 3. 分支保护（建议）

在 `main` 的 Branch protection rule 或 Ruleset 中：

- 开启 **Require a pull request before merging**。
- 开启 **Require status checks to pass before merging**。
- 选择成功 PR 运行中出现的精确检查名 `All checks passed`（来自 `ci.yml`）。
- 可开启 Require branches to be up to date、merge queue；不要把只在 push 后运行的 `Release` 作为 PR 必需检查。

## 工作流文件

| 文件 | 用途 |
| --- | --- |
| `.github/workflows/release.yml` | Version Packages PR + npm OIDC 发布 + GitHub Release + 手动 beta 预发布 |
| `.github/workflows/ci.yml` | PR/push 检查：Linux/macOS/Windows × Node 20/24 测试矩阵、类型检查、changeset 校验 |
| `.github/workflows/security.yml` | 依赖审查（PR 阻断高危）+ `npm audit`（周检 + main 阻断高危） |

所有第三方 action 均以 commit SHA 固定（与 OpenSpec 同源同版本）。
