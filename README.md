# ISA — Issues-as-Code

**Keep the *why* of every change inside the repository, and trace it through Git commit trailers.**

<p>
  <a href="https://github.com/d0ublecl1ck/isa/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/d0ublecl1ck/isa/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://www.npmjs.com/package/@d0ublecl1ck/isa-cli"><img alt="npm version" src="https://img.shields.io/npm/v/@d0ublecl1ck/isa-cli?style=flat-square" /></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" /></a>
  <a href="https://nodejs.org"><img alt="Node.js ≥ 20" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square" /></a>
</p>

ISA is a CLI for practicing **Issues-as-Code**: the intent behind every change lives in `docs/issues/` as plain Markdown, reviewed and merged like code, and every non-merge commit carries exactly one `Issue: <id>` trailer. Months later, `isa trace` answers "why does this line exist" without relying on anyone's memory.

Our philosophy:

```text
→ intent lives in the repo, not in a tracker
→ the issue comes before the change, never after
→ the repository is the single source of truth
→ built for humans and AI coding agents alike
```

## See it in action

```text
$ isa init
created docs/issues/
created AGENTS.md

$ isa new Add retry backoff to sync
created docs/issues/3fa91-add-retry-backoff-to-sync.md
Issue: 3fa91
# fill in Background / Scope / Non-goals / Acceptance Criteria ...

$ isa start 3fa91
Issue 3fa91 started.
# …

$ git commit -m "Add retry backoff" -m "Issue: 3fa91"

$ isa close 3fa91
closed docs/issues/closed/3fa91-add-retry-backoff-to-sync.md
Commit the archived status flip with both trailers:
Issue: 3fa91
Closes: 3fa91
```

The issue comes first, the trailer lands on every commit, and closing requires real evidence — `isa start` refuses placeholder intent, and `isa close` refuses commits without valid trailers.

## Why ISA?

AI coding assistants and fast-moving teams produce code faster than they produce context. When the *why* lives in chat history or an external tracker, it rots. ISA keeps intent versioned next to the code it motivated, and enforces the link at commit time.

- **Traceable from intent to commit** — issue documents are plain Markdown with YAML front matter; the commit trailer chain links every line back to the issue that motivated it.
- **Process that can't be skipped silently** — `start` validates intent sections, `close` validates trailers across the whole commit range, and `isa check` keeps every document valid in CI.
- **Offline-first, local-first** — every command works offline against the repository. Mirroring to GitHub Issues is explicit and on-demand via `isa sync`, never implicit.
- **Agent-ready** — ships a skill (`skills/isa/`, English and Chinese) that teaches AI coding agents the same discipline: create the issue before the change, trailer on every commit, close with evidence.

### How it compares

**vs. GitHub Issues alone** — external trackers drift away from the code and get skipped under pressure. ISA stores issues in the repo itself and makes the commit trailer a hard contract; `isa sync` still mirrors to GitHub Issues when you want the visibility.

**vs. spec-driven tools (OpenSpec, Spec Kit)** — those capture *what to build* (proposals, specs, tasks) before implementation. ISA captures *why each change exists* and enforces traceability from intent to commit. They compose well: write the spec, then track each change as an ISA issue.

**vs. nothing** — "why does this line exist" becomes an archaeology expedition through chat logs and memory. With ISA it is one `isa trace --file <path> --line <n>`.

## Quick start

**Requires Node.js 20 or higher.**

```bash
npm install -g @d0ublecl1ck/isa-cli
```

Adopt Issues-as-Code in a repository:

```bash
cd your-repo
isa init
```

`isa init` creates `docs/issues/` and appends a mandatory Issues-as-Code constraint to `AGENTS.md` (creating the file when missing), so every AI agent working in the repo follows the discipline. It is idempotent — re-running changes nothing.

Then run the daily loop:

```bash
isa new <title>        # 1. create the issue BEFORE touching files
isa start <id>         # 2. validate intent, flip to in-progress
# ... code, committing early and often, each commit carries `Issue: <id>` ...
isa check              # 3. validate all issue documents (CI-friendly)
isa close <id>         # 4. verify evidence and trailers, archive to docs/issues/closed/
```

## Commands

| Command | Description |
| --- | --- |
| `isa init [-t <path>] [--dry-run]` | Bootstrap a repository: create `docs/issues/` and append the mandatory constraint to `AGENTS.md`. Idempotent. |
| `isa new <title...> [--section <text>] [-t <path>] [--dry-run]` | Create `docs/issues/<id>-<title-slug>.md`. `--section` anchors the issue to a design document section. |
| `isa list [--status <s>] [--offset <n>] [--limit <n>] [-t <path>]` | Browse issues; filter by `open`, `in-progress`, `closed`, `cancelled`, or `all`. Prints at most 20 rows; page with `--offset`/`--limit` (1–100). |
| `isa show <id> [-t <path>]` | Print one issue document. Closed and cancelled IDs keep resolving. |
| `isa rename <id> <title...> [-t <path>] [--dry-run]` | Change title and filename slug. The five-character lowercase hex ID is immutable. |
| `isa start <id> [-t <path>] [--dry-run]` | Refuse placeholder intent, flip to in-progress, print the implementation prompt. |
| `isa close <id> [--base <ref>] [--prepare] [-t <path>] [--dry-run]` | Verify acceptance criteria, evidence, and commit trailers since `--base`; archive to `docs/issues/closed/`. |
| `isa cancel <id> <reason...> [-t <path>] [--dry-run]` | Cancel with a recorded reason and archive. |
| `isa trace <id> [-t <path>]` | List the commits linked to an issue. |
| `isa trace --file <path> --line <n> [-t <path>]` | Go from a line of code back to its issue via Git blame. |
| `isa attach <id> <file...> [-t <path>] [--dry-run]` | Copy files into `docs/issues/assets/<id>/` and link them in an `## Attachments` section. |
| `isa sync [--pull] [--force] [-t <path>]` | Mirror issues to GitHub Issues explicitly via `gh`. See [GitHub Issues mirror](#github-issues-mirror). |
| `isa check [-t <path>]` | Validate every issue document; exits non-zero on any violation. Safe for CI. |

Global flags: `-t, --target <path>` selects the repository root (default: current directory); `--dry-run` previews without writing; `-h, --help` and `-v, --version` print usage and version.

Issue documents carry YAML front matter with `id`, `status`, timestamps, `priority` (`critical`/`high`/`medium`/`low`), `labels`, `parent`, and `blocked_by`, followed by required sections: Background, Scope, Non-goals, Acceptance Criteria, Implementation, Verification, Related ADRs. `isa check` validates all of it.

## The commit trailer contract

Every non-merge commit must contain exactly one trailer:

```text
Issue: <id>
```

`isa close` enforces the contract: it requires a clean worktree, all acceptance criteria checked, real Implementation and Verification evidence, valid trailers on every non-merge commit since the base ref, and at least one commit linked to the closing issue.

Single-commit close: run `isa close <id> --prepare` before committing, then add both trailers to the same commit:

```text
Issue: <id>
Closes: <id>
```

A later plain `isa close <id>` only verifies the binding and creates no extra commit.

## GitHub Issues mirror

Repository files remain the single source of truth. `isa sync` uses the [GitHub CLI](https://cli.github.com/) (`gh`) to create or update `[<id>]`-prefixed GitHub Issues and maps local terminal states to `closed`. Repeating the command with no local change performs no GitHub writes; local commands stay offline and never sync implicitly.

Authenticate with `gh auth login`, `GITHUB_TOKEN`, or `GH_TOKEN`. A manually edited managed GitHub Issue is reported as a conflict and skipped — inspect the change, then use `isa sync --force` only when the repository copy should overwrite it. `isa sync --pull` imports unmanaged GitHub Issues into `docs/issues/`, assigns local IDs, and records remote comments under `docs/issues/comments/<id>.md`.

Use the bundled GitHub Action to sync on default-branch pushes:

```yaml
name: Sync ISA Issues
on:
  push:
    branches: [main]
permissions:
  contents: read
  issues: write
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: d0ublecl1ck/isa@main
```

## Agent skill

`skills/isa/SKILL.md` (English) and `skills/isa/SKILL.zh.md` (Chinese) teach AI coding agents the Issues-as-Code discipline: when to create an issue, when to start it, the trailer rule on every commit, and how to close with evidence. Point your agent at the skill directory, or copy it into your agent's skills location. Combined with the `AGENTS.md` constraint written by `isa init`, agents in an adopted repo follow the workflow without prompting.

## Development

```bash
npm install
npm run build       # compile TypeScript to dist/
npm test            # vitest
npm run typecheck   # strict typecheck including tests
```

CI runs the test matrix on Linux (Node 20 and 24), macOS (Node 20), and Windows (Node 20), plus typecheck and `isa check` on this repository's own issue documents — ISA is maintained with ISA.

### Releasing

Releases run on Changesets + GitHub Actions with npm OIDC trusted publishing: a `chore(release): version packages` PR is opened automatically on pushes to `main`, and merging it publishes `@d0ublecl1ck/isa-cli` to npm and creates the GitHub Release. A manual `beta` prerelease can be dispatched from the Release workflow (`npm install -g @d0ublecl1ck/isa-cli@beta`). One-time credential setup (npm trusted publisher, GitHub App) is documented in [.github/RELEASE-SETUP.md](./.github/RELEASE-SETUP.md).

## License

[MIT](./LICENSE)
