# ISA — Issues-as-Code

ISA is a CLI for practicing **Issues-as-Code**: the *why* of every change lives in `docs/issues/` inside the repository, and every non-merge commit carries exactly one `Issue: <id>` trailer. Months later, `isa trace` answers "why does this line exist" without relying on anyone's memory.

ISA ships an agent skill (`skills/isa/`) so AI coding agents adopt the same discipline: create the issue **before** the change, commit with the trailer, close with evidence.

## Philosophy

1. **Work must be traceable from intent to commit.** Issue documents are plain Markdown with YAML front matter, reviewed and merged like code. The commit trailer chain links every line back to the issue that motivated it.
2. **The issue comes before the change, never after.** Retroactive issues make history lie. `isa start` refuses placeholder intent; `isa close` refuses commits without trailers.
3. **The repository is the single source of truth.** `isa sync` mirrors issues to GitHub Issues explicitly and only on demand. Nothing syncs implicitly.

## Install

```bash
npm install -g isa-cli
```

> The package is pending its first npm publish; until then, install from source: `git clone <repo> && npm install && npm run build && npm link`.

Requires Node.js ≥ 20. `isa sync` additionally requires the [GitHub CLI](https://cli.github.com/) (`gh`).

## Quick start

```bash
cd your-repo
isa new Add local traceability   # creates docs/issues/<id>-add-local-traceability.md
# fill in Background / Scope / Non-goals / Acceptance Criteria
isa start <id>                   # flips to in-progress, prints the implementation prompt
# ... code, then commit with the trailer:
git commit -m "Add local traceability" -m "Issue: <id>"
isa close <id>                   # validates evidence + trailers, archives to docs/issues/closed/
```

## Commands

```text
isa new <title...> [--section <design section>] [-t <path>] [--dry-run]
isa list [--status <status>] [--offset <n>] [--limit <n>] [-t <path>]
isa show <id> [-t <path>]
isa rename <id> <title...> [-t <path>] [--dry-run]
isa start <id> [-t <path>] [--dry-run]
isa close <id> [--base <ref>] [--prepare] [-t <path>] [--dry-run]
isa cancel <id> <reason...> [-t <path>] [--dry-run]
isa trace <id> [-t <path>]
isa trace --file <path> --line <number> [-t <path>]
isa attach <id> <file...> [-t <path>] [--dry-run]
isa sync [--pull] [--force] [-t <path>]
isa check [-t <path>]
```

- Issue documents live at `docs/issues/<id>-<title-slug>.md`; `close`/`cancel` archive them to `docs/issues/closed/`, and every command reads both locations — closed IDs keep resolving in `show`, `trace`, and `list --status closed`.
- The five-character lowercase hexadecimal ID is immutable; `rename` changes only the title and filename slug.
- Front matter supports `priority` (`critical`/`high`/`medium`/`low`), `labels`, `parent`, and `blocked_by`; `isa check` validates every document and is CI-friendly.
- `attach` copies files into `docs/issues/assets/<id>/` and links them in an `## Attachments` section.
- `list` prints at most 20 rows by default; use `--offset`/`--limit` (1–100) to page.

### The commit trailer contract

Every non-merge commit must contain exactly one trailer:

```text
Issue: <id>
```

`isa close` requires a clean worktree, all acceptance criteria checked, real Implementation and Verification evidence, valid trailers on every non-merge commit since the base ref, and at least one commit linked to the closing issue.

Single-commit close: run `isa close <id> --prepare` before committing, then add both trailers to the same commit:

```text
Issue: <id>
Closes: <id>
```

A later plain `isa close <id>` only verifies the binding and creates no extra commit.

### GitHub Issues mirror

Repository files remain the single source of truth. `isa sync` uses `gh` to create or update `[<id>]` GitHub Issues and maps local terminal states to `closed`. Repeating the command with no local change performs no GitHub writes. Local commands stay offline and never sync implicitly.

Authenticate with `gh auth login`, `GITHUB_TOKEN`, or `GH_TOKEN`. A manually edited managed GitHub Issue is reported as a conflict and skipped; inspect the change, then use `isa sync --force` only when the repository copy should overwrite it. `--pull` imports unmanaged GitHub Issues into `docs/issues/`, assigns local IDs, and records remote comments under `docs/issues/comments/<id>.md`.

Use the bundled GitHub Action on default-branch pushes:

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
      - uses: <owner>/isa@main
```

## Agent skill

`skills/isa/SKILL.md` (English) and `skills/isa/SKILL.zh.md` (Chinese) teach AI coding agents the Issues-as-Code discipline: when to create an issue, when to start it, the trailer rule on every commit, and how to close with evidence. Point your agent at the skill directory, or copy it into your agent's skills location.

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
```

ISA is maintained as a standalone, focused tool for Issues-as-Code.

### Releasing

Releases run on Changesets + GitHub Actions with npm OIDC trusted publishing: a `chore(release): version packages` PR is opened automatically on pushes to `main`, and merging it publishes to npm and creates the GitHub Release. A manual `beta` prerelease can be dispatched from the Release workflow. One-time credential setup (npm trusted publisher, GitHub App) is documented in [.github/RELEASE-SETUP.md](./.github/RELEASE-SETUP.md).

## License

[MIT](./LICENSE)
