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

- [ ] `openspec/` exists with init artifacts and the change proposal for this work validates via `openspec validate <change-id> --strict`.
- [ ] README `### Releasing` is reduced to a brief community-facing note (mechanism in one or two sentences) with no credential-setup guidance and no link to the setup checklist.
- [ ] `.github/RELEASE-SETUP.md` no longer exists; its content lives at `docs/release-setup.md` with a maintainer-facing note at the top.
- [ ] No remaining references to `.github/RELEASE-SETUP.md` outside `docs/issues/closed/` historical records.
- [ ] `npm run build`, `npm test`, `npm run typecheck`, and `node dist/cli.js check` all pass.

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
