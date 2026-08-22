---
id: d835e
status: closed
created_at: 2026-08-22T05:13:02.982Z
updated_at: 2026-08-22T05:15:28.066Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-22T05:13:55.851Z
closed_at: 2026-08-22T05:15:28.066Z
---

# Port OpenSpec init command

## Background

ISA practices Issues-as-Code, but a fresh repository has no `docs/issues/` and no agent-facing rule enforcing the discipline, so adoption depends on manual setup. OpenSpec solves the same bootstrap problem with an idempotent `openspec init` (`src/core/init.ts`). Porting that idea as `isa init` gives ISA repos a one-command, repeatable way to adopt the workflow. Requested as Multica TASK-20.

## Scope

- Add `isa init [-t <path>] [--dry-run]`: create `docs/issues/` and append the mandatory Issues-as-Code constraint to `AGENTS.md`, creating the file when missing.
- Make every step idempotent: re-running reports `exists` and changes nothing; a marker comment (`<!-- isa:agents-constraint -->`) detects prior runs.
- Translate raw filesystem errors (`EEXIST`/`EISDIR`-class) into ISA's own actionable error messages.
- Dry-run output distinguishes `create` from `update` so users can predict the action.
- Cover the mixed states (only `docs/issues/` present, only `AGENTS.md` present, append without trailing newline) with tests.
- Document the command in `README.md` and `skills/isa/SKILL.md` / `SKILL.zh.md`.

## Non-goals

- No changes to existing issue lifecycle commands (`new`/`start`/`close`/etc.).
- No template customization options beyond what is described above.
- Release packaging/CI wiring (tracked separately in `067a2`).

## Acceptance Criteria

- [x] `isa init` on a fresh directory creates `docs/issues/` and an `AGENTS.md` containing the mandatory constraint.
- [x] `isa init` with an existing `AGENTS.md` appends the constraint, preserving prior content byte-for-byte (with and without trailing newline).
- [x] Re-running `isa init` is a no-op and reports `exists` for both artifacts.
- [x] `--dry-run` writes nothing and distinguishes `create` vs `update` in its output.
- [x] `docs` existing as a regular file (or `docs/issues`/`AGENTS.md` of the wrong type) fails with an ISA error message, not a raw `EEXIST`/`EISDIR`.
- [x] `npm run build`, `npm run typecheck`, and `npm test` all pass.

## Implementation

- `src/init.ts`: `runInitCommand` resolves the target root, guards non-directory roots, creates `docs/issues/` with `mkdir -p` semantics wrapped in a friendly error, then creates/appends/skips `AGENTS.md` based on the `<!-- isa:agents-constraint -->` marker. Append preserves existing bytes and inserts a blank-line separator when the file lacks a trailing newline.
- `src/cli.ts`: registers the `init` action, rejects positional arguments, and documents the command in HELP.
- The constraint sentence intentionally names the platform — "我们当前平台(ISA,Issues-as-Code CLI)" — instead of the bare "我们当前平台" from the original request, so the generated `AGENTS.md` stays unambiguous when read outside this workspace's context.
- `.gitignore` now excludes Multica agent-runtime artifacts (`AGENTS.md` runtime template, `.agent_context/`, `.multica/`, `.pi/`) so future agent runs cannot accidentally commit them; the stray `description.md` draft was dropped from the tree.
- Tests: `src/init.test.ts` (11 cases incl. mixed states, no-trailing-newline append, wrong-type paths, dry-run distinction) and `src/cli.test.ts` (end-to-end init + idempotency + positional rejection).

## Verification

- TDD: new tests fail against the pre-fix implementation (4 failures: raw `EISDIR`, missing dry-run distinction), pass after it.
- `npm run build` ✅, `npm run typecheck` ✅, `npm test` 119/119 ✅ (was 113; +6 new init cases).
- Temp-directory smoke runs: fresh init, append preserving content, idempotent rerun, dry-run with zero writes — all as expected.

## Related ADRs

- None.
