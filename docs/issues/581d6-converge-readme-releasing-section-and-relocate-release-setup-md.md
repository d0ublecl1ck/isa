---
id: 581d6
status: in-progress
created_at: 2026-08-23T09:21:56.897Z
updated_at: 2026-08-23T09:22:46.678Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-23T09:22:46.678Z
---

# Converge README Releasing section and relocate RELEASE-SETUP.md

## Background

Multica TASK-38 (user-approved TASK-32 review conclusion): the README `### Releasing` section oversteps for a community-facing document — it details the release mechanics and one-time credential setup (Version Packages PR, beta prerelease dispatch, link to `.github/RELEASE-SETUP.md`) from a publisher's perspective. Meanwhile `.github/RELEASE-SETUP.md` is a maintainer-facing one-time credential checklist (fully completed as of 2026-08-22) that does not belong in the contributor-facing `.github/` surface. The README should carry only a one-or-two-sentence community-facing note, and the setup checklist should live under `docs/` clearly marked as a maintainer document. This change is executed through the OpenSpec proposal flow (the repository adopts OpenSpec with this change).

## Scope

- Adopt OpenSpec in this repository: `openspec init` artifacts committed on this branch.
- Rewrite the README `### Releasing` section into a brief community-facing note consistent with the tone of surrounding sections; remove the credential-setup pointer.
- Move `.github/RELEASE-SETUP.md` to `docs/release-setup.md`, marked at the top as a maintainer-facing document.
- Update every in-repo reference to the old `.github/RELEASE-SETUP.md` path.

## Non-goals

- No changes to `.github/workflows/`, `.changeset/`, or the release automation itself.
- No content rewrite of the setup checklist beyond relocation and the maintainer-facing header note.
- No OpenSpec-driven changes to runtime code (`src/`).

## Acceptance Criteria

- [x] `openspec/` exists with init artifacts and the change proposal for this work validates via `openspec validate <change-id> --strict`.
- [x] README `### Releasing` is reduced to a brief community-facing note (mechanism in one or two sentences) with no credential-setup guidance and no link to the setup checklist.
- [x] `.github/RELEASE-SETUP.md` no longer exists; its content lives at `docs/release-setup.md` with a maintainer-facing note at the top.
- [x] No remaining references to `.github/RELEASE-SETUP.md` outside `docs/issues/closed/` historical records.
- [x] `npm run build`, `npm test`, `npm run typecheck`, and `node dist/cli.js check` all pass.

## Implementation

- `README.md` `### Releasing` rewritten to a single community-facing sentence: releases are automated with Changesets, and merging the automated `chore(release): version packages` PR publishes to npm and creates the GitHub Release. Credential-setup guidance, beta-dispatch detail, and the `./.github/RELEASE-SETUP.md` link removed.
- `.github/RELEASE-SETUP.md` moved to `docs/release-setup.md` via `git mv`; a maintainer-facing blockquote added at the top (audience: maintainers; one-time setup completed 2026-08-22; reference only for reconfiguration or migration). No other content changed.
- Reference sweep: `grep -rn 'RELEASE-SETUP'` over `README.md`, `docs/`, `AGENTS.md`, `skills/`, `src/`, `.github/` — the only remaining mentions outside `docs/issues/closed/` are this change's own records (this issue document and the OpenSpec change directory describing the move); no live link points at the old path.
- OpenSpec change `converge-readme-releasing-relocate-release-setup` tasks all completed; the change is archived via `openspec archive --skip-specs` (docs-only, no spec deltas).

## Verification

- `npm run build` — pass (`tsc -p tsconfig.json`).
- `npm test` — 7 test files, 120 tests passed.
- `npm run typecheck` — pass (`tsc --noEmit -p tsconfig.test.json`).
- `node dist/cli.js check` — "All Issues-as-Code documents are valid."
- `openspec validate converge-readme-releasing-relocate-release-setup --strict` — "Change 'converge-readme-releasing-relocate-release-setup' is valid" (run before archiving).
- Post-archive: `openspec validate --archived` — archived change reported valid with all tasks completed.

## Related ADRs

- None.
