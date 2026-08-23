---
id: c27a2
status: in-progress
created_at: 2026-08-23T11:32:30.714Z
updated_at: 2026-08-23T11:33:20.598Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-23T11:33:20.598Z
---

# Translate existing OpenSpec artifacts to Chinese

## Background

Multica TASK-43: the workspace rules now mandate (user-approved 2026-08-23) that every OpenSpec artifact (`proposal.md`, `specs/`, `design.md`, `tasks.md`, and other change-directory products, including archived ones) MUST be written in Chinese, with proper nouns (OpenSpec, Changesets, etc.), commands, code identifiers, and file names kept in the original. The existing OpenSpec artifacts on `main` (HEAD `cd7d905`) are all in English: `openspec/config.yaml` (comments/examples) and the archived change `openspec/changes/archive/2026-08-23-converge-readme-releasing-relocate-release-setup/` (`proposal.md`, `design.md`, `tasks.md`). This change translates them into Chinese so the backlog aligns with the new rule. This change is itself executed through the OpenSpec proposal flow, with the proposal artifacts written in Chinese (first application of the new rule).

## Scope

- Translate `openspec/config.yaml` comments and example text into Chinese; configuration keys and values (e.g. `schema: spec-driven`) stay unchanged.
- Translate `proposal.md`, `design.md`, and `tasks.md` of the archived change `2026-08-23-converge-readme-releasing-relocate-release-setup` into Chinese; keep the checked task states (`[x]`) and all historical facts (TASK numbers, dates, PR numbers) verbatim.
- `.openspec.yaml` of the archived change is machine configuration (`schema`, `created`, `skip_specs`) and stays as-is.
- Directory names, file names, archive date prefixes, and frontmatter key names are not modified.
- Execute via OpenSpec: change `translate-openspec-artifacts-to-chinese` with Chinese proposal artifacts, `skip_specs: true` (docs-only, zero spec delta), archived alongside the implementation per the TASK-38 precedent.

## Non-goals

- No rewriting, additions, or deletions of meaning — translation only.
- No changes to runtime code (`src/`), workflows, or package configuration.
- No translation of ISA issue documents under `docs/issues/` (out of scope for TASK-43; the language rule covers OpenSpec artifacts only).

## Acceptance Criteria

- [x] `openspec/config.yaml` comments and examples are in Chinese; `schema: spec-driven` and all other keys/values are byte-identical.
- [x] All three Markdown files of the archived change `2026-08-23-converge-readme-releasing-relocate-release-setup` are in Chinese, with commands, code identifiers, file paths, URLs, and historical facts preserved verbatim.
- [x] OpenSpec change `translate-openspec-artifacts-to-chinese` validates via `openspec validate <change-id> --strict` (before archive) and `openspec validate --archived` (after archive).
- [x] `npm run build`, `npm test`, `npm run typecheck`, and `node dist/cli.js check` all pass.

## Implementation

- Translated the three comment blocks in `openspec/config.yaml` (project context, per-artifact rules, per-operation guidance) into Chinese; `schema: spec-driven` and all example config key names kept verbatim — diff confirmed zero non-comment line changes.
- Translated `proposal.md`, `design.md`, and `tasks.md` of archived change `2026-08-23-converge-readme-releasing-relocate-release-setup` into Chinese; `[x]` states, task numbering, section headings, commands, paths, URLs, and historical facts (TASK numbers, dates, PR numbers) preserved verbatim; `.openspec.yaml` left as-is.
- Verified via extraction diff that backtick spans, paths, URLs, and checkbox markers are identical between the English originals and the Chinese translations.
- Archived the change with `openspec archive translate-openspec-artifacts-to-chinese --skip-specs` per the TASK-38 precedent.

## Verification

- `openspec validate translate-openspec-artifacts-to-chinese --strict` → valid (before archive); `openspec validate --archived` → all archived changes valid (after archive).
- `npm run build` → pass; `npm test` → 120/120 pass (7 files); `npm run typecheck` → pass; `node dist/cli.js check` → "All Issues-as-Code documents are valid."
- Diff check: non-comment lines of `openspec/config.yaml` unchanged; code spans/paths/URLs/checkboxes of the three archived Markdown files unchanged.

## Related ADRs

- None.
