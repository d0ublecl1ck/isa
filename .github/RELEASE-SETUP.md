# 发布流程与配置清单

ISA 的发布流程移植自 [OpenSpec](https://github.com/Fission-AI/OpenSpec)，基于 **Changesets + GitHub Actions + npm OIDC trusted publishing**（无需 npm token）。

## 日常流程

1. 开发 PR 中包含用户可见变更时，运行 `npx changeset` 添加一个 changeset 文件（`.changeset/*.md`），随 PR 一起提交。CI 的 `Validate Release Tracking` job 会校验。
2. PR 合并进 `main` 后，`Release` workflow（`.github/workflows/release.yml`）的 `prepare` job 自动开启/更新 **"chore(release): version packages"** PR。
3. 合并该 Version PR 后，同一 workflow 执行 `npm run release:ci`（即 `changeset publish`），通过 npm OIDC trusted publishing 发布到 npm，并自动创建 GitHub Release。
4. 手动触发 beta 预发布：Actions → Release → Run workflow（从 `main`）。按 pending changesets 计算下一个稳定版本号加 `-beta.N` 后缀，发布到 npm 的 `beta` dist-tag 并创建 prerelease 标记的 GitHub Release，不消耗 changesets。用户通过 `npm install -g isa-cli@beta` 安装。

## 一次性凭据配置清单（仓库 owner 完成）

代码已落地，以下配置需要在 GitHub / npm 侧手动完成，发布流程才能工作：

### 1. npm OIDC trusted publishing（必需）

在 npmjs.com 为 `isa-cli` 包配置 Trusted Publisher：

- 进入 https://www.npmjs.com/package/isa-cli/access → **Trusted Publishers**（若包尚未发布，需先手动 `npm publish` 首个版本，或在包设置预配置）。
- 添加 GitHub Actions trusted publisher：
  - Organization/user: `d0ublecl1ck`
  - Repository: `isa`
  - Workflow filename: `release.yml`（**trusted publishing 按 workflow 文件名授权，只能授权一个文件**，beta job 因此也放在同一文件中）
  - Environment: 留空
- 配置后发布不再需要 `NPM_TOKEN`，workflow 中的 `id-token: write` 权限即完成认证。

### 2. GitHub App（必需，用于 Version Packages PR）

`GITHUB_TOKEN` 触发的 git 操作无法再触发后续 CI，因此需要 GitHub App token：

1. 在 GitHub → Settings → Developer settings → GitHub Apps → New GitHub App：
   - 权限：Contents: Read & write，Pull requests: Read & write
   - 仅安装到 `d0ublecl1ck/isa`
2. 记录 **App ID**，生成 **Private key**。
3. 在仓库 Settings → Secrets and variables → Actions：
   - Variable `APP_ID` = App ID
   - Secret `APP_PRIVATE_KEY` = 私钥全文

### 3. 分支保护（建议）

将 `main` 分支保护中的 required status checks 设为 `All checks passed`（来自 `ci.yml`），并视需要启用 merge queue（workflow 已监听 `merge_group`）。

## 工作流文件

| 文件 | 用途 |
| --- | --- |
| `.github/workflows/release.yml` | Version Packages PR + npm OIDC 发布 + GitHub Release + 手动 beta 预发布 |
| `.github/workflows/ci.yml` | PR/push 检查：Linux/macOS/Windows × Node 20/24 测试矩阵、类型检查、changeset 校验 |
| `.github/workflows/security.yml` | 依赖审查（PR 阻断高危）+ `npm audit`（周检 + main 阻断高危） |

所有第三方 action 均以 commit SHA 固定（与 OpenSpec 同源同版本）。
