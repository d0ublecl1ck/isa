# Proposal: converge-readme-releasing-relocate-release-setup

## Why

The README `### Releasing` section is written from the publisher's perspective: it details release mechanics (Version Packages PR, manual `beta` prerelease dispatch) and points readers at one-time credential setup in `.github/RELEASE-SETUP.md`. A community-facing README should not carry maintainer credential-configuration guidance. Meanwhile `.github/RELEASE-SETUP.md` is a maintainer-facing one-time checklist (fully completed as of 2026-08-22) sitting in the contributor-facing `.github/` directory. This is the user-approved conclusion of the TASK-32 review (Multica TASK-38).

## What Changes

- Rewrite README `### Releasing` into a brief community-facing note: releases are automated via Changesets and publishing to npm happens by merging the automated version PR. Remove the credential-setup guidance and the link to the setup checklist; keep the tone consistent with surrounding sections.
- Move `.github/RELEASE-SETUP.md` to `docs/release-setup.md` and add a maintainer-facing notice at the top of the document.
- Update every in-repo reference from `./.github/RELEASE-SETUP.md` to the new location (historical records under `docs/issues/closed/` are left untouched).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- None. This is a pure documentation change: no CLI behavior, command surface, or requirement changes, so this change sets `skip_specs: true` in `.openspec.yaml` per the spec-driven schema guidance for docs-only changes.

## Impact

- **Docs**: `README.md` (Releasing section), `.github/RELEASE-SETUP.md` → `docs/release-setup.md`.
- **Repo tooling**: this branch also adopts OpenSpec (`openspec/` init artifacts) as the project's change-management flow going forward.
- **No runtime impact**: `src/`, `.github/workflows/`, and `.changeset/` are untouched; the release automation itself is unchanged.
