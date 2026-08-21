---
name: isa
description: 在任意仓库中用 ISA CLI 实践 Issues-as-Code。涵盖理念（每次变更的“为什么”存放在仓库内的 docs/issues/ 中，且每个非合并提交必须携带且仅携带一个 Issue: <id> trailer）以及每条命令必须运行的时机——修改前先 issue new/start、每次提交带 Issue trailer、验证后 close、CI 中跑 check。当项目包含 docs/issues/、用户提到 ISA、Issues-as-Code、issue trace 或提交 trailer，或在以 issue 文档追踪工作的仓库中修改文件前触发。
---

# ISA — Issues-as-Code

ISA 是一个让工作从意图到提交全程可追溯的 CLI。本 skill 解释它为什么存在、每条命令必须在什么时候运行。flag 细节见 `isa --help`；本 skill 讲的是判断，不是参数。

## 理念 —— 先读这个

ISA 建立在三个理念之上，下面的所有工作流都由此推出。

1. **工作必须能从意图追溯到提交。** Issues-as-Code 把每次变更的“为什么”以文档形式存放在仓库内的 `docs/issues/` 中，每个非合并提交必须携带且仅携带一个 `Issue: <id>` trailer。几个月后，`isa trace` 能回答“这行代码为什么存在”，不依赖任何人的记忆。
2. **先有 issue，后有变更，顺序不可颠倒。** 可追溯性只有在写代码**之前**创建 issue 才成立。先写代码再补 issue 的 agent 制造的是说谎的历史。
3. **仓库是唯一事实来源。** Issue 文档是带 YAML front matter 的普通 Markdown，像代码一样评审和合并。`isa sync` 只会显式地把它们镜像到 GitHub Issues——没有任何隐式同步。

这套机制防的典型失败模式：agent 在没有进行中 issue 的情况下直接改文件。如果你正准备在一个有 `docs/issues/` 的仓库里改代码或文档，而没有 issue 在进行中——停，这就是本 skill 适用的时刻。

## Issue 文档契约

Issue 文档位于 `docs/issues/<id>-<title-slug>.md`；`close` 和 `cancel` 会把它们归档到 `docs/issues/closed/`，所有命令同时读取两个位置。五位小写十六进制 ID 不可变；`isa rename` 只改标题和文件名 slug。

每份文档包含 YAML front matter（`id`、`status`、时间戳、`priority`、`labels`、`parent`、`blocked_by`）和以下必需章节（顺序固定）：Background、Scope、Non-goals、Acceptance Criteria、Implementation、Verification、Related ADRs。`isa check` 校验所有文档，可安全放入 CI。

## 工作流 —— 日常循环

```bash
isa new <title>        # 1. 改文件之前先创建 issue
isa start <id>         # 2. 校验意图章节，翻转为 in-progress
# ... 写代码，小步频繁提交，每个提交带 `Issue: <id>` ...
isa check              # 3. 校验文档（可选但推荐）
isa close <id>         # 4. 验收标准全部勾选、证据记录完毕后关闭
```

### 在任何代码或文档变更之前

```bash
isa new <title>
isa start <id>
```

**先**创建 issue 再动文件。绝不先提交再补 issue。先填好 Background、Scope、Non-goals 和 Acceptance Criteria——`start` 会拒绝意图章节仍是占位符的 issue，并打印实施提示，照它做。

### 每次提交时

每个非合并提交的提交信息必须携带且仅携带一个对应仓库中真实 issue 的 `Issue: <id>` trailer。没有 trailer，就不提交。

提交节奏是纪律的一部分，不是偏好：
- 每完成一个可验证的小步（测试转绿、脚手架落地、子任务收尾）**必须**立即提交。
- 未提交变更累积超过约 10 个文件时，**必须停止**写新代码——先拆分提交。
- **禁止**会话结束时一次性巨型提交；那会摧毁 Issues-as-Code 存在的意义。

### 完成 issue

```bash
isa close <id>
```

只有在每条 Acceptance Criteria 复选框都已勾选、Implementation 和 Verification 章节记录了真实证据（命令及其结果，而非占位符）之后。`close` 会强制要求干净的工作区、base ref 之后每个非合并提交都有合法 trailer、且至少有一个提交关联到该 issue，然后把文档归档到 `docs/issues/closed/`。

单提交关闭：提交前运行 `isa close <id> --prepare`：它只翻转状态、不碰 Git，实现与状态翻转落在同一个同时携带 `Issue: <id>` 和 `Closes: <id>` trailer 的提交里；之后再运行普通 `close` 只是验证绑定关系。

### 调查

- `isa trace <id>` —— 找到关联某个 issue 的所有提交。
- `isa trace --file <path> --line <n>` —— 通过 blame 从某行代码反查它属于哪个 issue。
- `isa show <id>` / `isa list [--status ...]` —— 读取 issue 内容与列表；已关闭的 ID 仍可解析，因为所有命令都会读归档目录。

### GitHub 镜像（显式，绝不自动）

- `isa sync` —— 把本地 issue 镜像为 `[<id>]` 前缀的 GitHub Issue；本地文件仍是唯一事实来源。本地无变化时重复执行不会产生任何写入。
- `isa sync --pull` —— 把未纳管的 GitHub Issue 导入 `docs/issues/`，并把远端评论记录到 `docs/issues/comments/<id>.md`。
- 被人工编辑过的纳管 GitHub Issue 会被报为冲突并跳过；先检查，仅当应以仓库副本覆盖时才用 `isa sync --force`。

## 什么时候**不要**用 ISA

- 搜索字符串字面量、错误消息或配置值——用 `rg` 或直接读文件。
- 跑项目自己的测试套件——ISA 校验的是 issue 文档（`isa check`），不校验项目代码。
- 尚未采纳 Issues-as-Code 的仓库（没有 `docs/issues/`）——issue 命令会制造用户从未要求的流程。只有在用户想要时才采纳。
- 超出 trailer 约定的 Git 操作——ISA 不会替你建分支、提交或装 hook。

## 常见坑

- **先提交后 `isa new`**：trailer 会指向补录的 issue，`trace` 历史就是在说谎。先 issue，后代码。
- **trailer 缺失或多余**：`close` 会拒绝这段提交范围。每个非合并提交恰好一个 trailer。
- **为了通过校验而改写 issue 正文措辞**：当 `start`/`close` 校验误伤合法内容时，直接编辑 issue front matter 绕过；绝不为迎合检查而改写合法内容。
- **以为 `sync` 是自动的**：它是显式且本地优先的；你不运行，就不会同步。
