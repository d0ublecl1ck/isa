---
name: isa
description: Practice Issues-as-Code with the ISA CLI in any repository. Covers the philosophy (the why of every change lives in docs/issues/ inside the repo, and every non-merge commit carries exactly one Issue: <id> trailer) and the exact moment each command must run — issue new/start before editing, the Issue trailer on every commit, close after verification, check in CI. Trigger when a project contains docs/issues/, when the user mentions ISA, Issues-as-Code, issue trace, or commit trailers, or before editing files in a repository that tracks work as issue documents.
---

# ISA — Issues-as-Code

ISA is a CLI that keeps work traceable from intent to commit. This skill explains why it exists and when each command must run. Flag-level details live in `isa --help`; this skill is about judgment, not flags.

## Philosophy — read this first

ISA rests on three ideas. Every workflow below follows from them.

1. **Work must be traceable from intent to commit.** Issues-as-Code keeps the *why* of every change in `docs/issues/` inside the repository, and every non-merge commit carries exactly one `Issue: <id>` trailer. Months later, `isa trace` answers "why does this line exist" without relying on anyone's memory.
2. **The issue comes before the change, never after.** Traceability only works if the issue is created **before** the code. An agent that codes first and backfills the issue afterwards produces history that lies.
3. **The repository is the single source of truth.** Issue documents are plain Markdown with YAML front matter, reviewed and merged like code. `isa sync` mirrors them to GitHub Issues explicitly and only on demand — nothing syncs implicitly.

The recurring failure mode this prevents: an agent that edits files with no issue in progress. If you are about to change code or docs in a repository that has `docs/issues/` and no issue is in progress, stop — that is the moment this skill applies.

## The issue document contract

Issue documents live at `docs/issues/<id>-<title-slug>.md`; `close` and `cancel` archive them to `docs/issues/closed/`, and every command reads both locations. The five-character lowercase hexadecimal ID is immutable; `isa rename` changes only the title and filename slug.

Each document carries YAML front matter (`id`, `status`, timestamps, `priority`, `labels`, `parent`, `blocked_by`) and these required sections in order: Background, Scope, Non-goals, Acceptance Criteria, Implementation, Verification, Related ADRs. `isa check` validates every document and is safe to run in CI.

## Workflow — the daily loop

```bash
isa new <title>        # 1. create the issue BEFORE touching files
isa start <id>         # 2. validate intent, flip to in-progress
# ... edit code, commit early and often, each commit carries `Issue: <id>` ...
isa check              # 3. validate documents (optional but recommended)
isa close <id>         # 4. after acceptance criteria are checked and evidence recorded
```

### Before any code or documentation change

```bash
isa new <title>
isa start <id>
```

Create the issue **before** touching files. Never commit first and backfill the issue. Fill in Background, Scope, Non-goals, and Acceptance Criteria first — `start` refuses issues whose intent sections are placeholders, and prints the implementation prompt; follow it.

### On every commit

Every non-merge commit message must carry exactly one `Issue: <id>` trailer matching a real issue in the repo. No trailer, no commit.

Commit cadence is part of the discipline, not a preference:
- After every verifiable small step (a test turns green, a scaffold lands, a sub-task wraps up) you **MUST** commit immediately.
- When uncommitted changes accumulate beyond ~10 files, you **MUST NOT** write new code — split and commit first.
- One giant end-of-session commit is **MUST NOT**; it destroys the traceability Issues-as-Code exists for.

### Completing an issue

```bash
isa close <id>
```

Only after every Acceptance Criteria checkbox is checked and the Implementation and Verification sections record real evidence (commands and their results, not placeholders). `close` enforces a clean worktree and valid trailers on every non-merge commit since the base ref, requires at least one commit linked to the closing issue, then archives the document to `docs/issues/closed/`.

For a single-commit close, run `isa close <id> --prepare` before committing: it flips the status without touching Git, so implementation and status flip land in one commit carrying both `Issue: <id>` and `Closes: <id>` trailers; a later plain `close` only verifies the binding.

### Investigation

- `isa trace <id>` — find the commits linked to an issue.
- `isa trace --file <path> --line <n>` — go from a line of code back to its issue via blame.
- `isa show <id>` / `isa list [--status ...]` — read issue content and browse; closed IDs keep resolving because all commands read the archive too.

### GitHub mirror (explicit, never automatic)

- `isa sync` — mirror local issues to GitHub Issues as `[<id>]`-prefixed issues; local files remain the source of truth. Repeating with no local change performs no writes.
- `isa sync --pull` — import unmanaged GitHub Issues into `docs/issues/` and record remote comments under `docs/issues/comments/<id>.md`.
- A manually edited managed GitHub Issue is reported as a conflict and skipped; inspect it, then use `isa sync --force` only when the repository copy should overwrite.

## When NOT to reach for ISA

- Searching string literals, error messages, or config values — use `rg` or file reads.
- Running the project's test suite — ISA validates issue documents (`isa check`), not project code.
- Repositories that have not adopted Issues-as-Code (no `docs/issues/`) — issue commands would create process the user never asked for. Adopt it only when the user wants it.
- Git operations beyond the trailer convention — ISA never creates branches, commits, or hooks for you.

## Pitfalls

- **Committing before `isa new`**: the trailer then points at a backfilled issue and `trace` history lies. Issue first, code second.
- **Multiple or missing trailers**: `close` rejects the range. Exactly one trailer per non-merge commit.
- **Expecting `sync` to be automatic**: it is explicit and local-first; nothing syncs unless you run it.
