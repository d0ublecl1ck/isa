---
id: 62e9b
status: closed
created_at: 2026-08-22T17:14:30.725Z
updated_at: 2026-08-22T17:19:07.063Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-22T17:15:18.736Z
closed_at: 2026-08-22T17:19:07.063Z
---

# Finalize release ownership: npm trusted publisher connected and beta OIDC verification

## Background

e75d3 prepared the owner-side configuration. All external setup is now done: `main` is pushed to `d0ublecl1ck/isa`, GitHub App `d0ublecl1ck-isa-release` is installed with `APP_ID`/`APP_PRIVATE_KEY` configured, branch protection requires `All checks passed`, the first version `0.1.0` is published, and the npm Trusted Publisher connection for `d0ublecl1ck/isa` + `release.yml` is established. What remains is recording that status in the repo and proving the OIDC publish path end-to-end with a beta prerelease.

## Scope

- Record the completed owner-side configuration status in `.github/RELEASE-SETUP.md`.
- Add a patch changeset so a beta prerelease can be cut from `main`.
- Run the manual beta job and verify npm `beta` dist-tag + GitHub prerelease via OIDC.

## Non-goals

- No workflow or CLI code changes.
- No stable release; beta only.

## Acceptance Criteria

- [x] `RELEASE-SETUP.md` reflects the completed configuration.
- [x] Manual beta run publishes `@d0ublecl1ck/isa-cli` to the `beta` dist-tag and creates a prerelease GitHub Release.

## Implementation

- `.github/RELEASE-SETUP.md` now records that all one-time owner-side configuration is complete (repo push, GitHub App, branch protection, npm first publish, Trusted Publisher).
- Added patch changeset `.changeset/tidy-pandas-release.md` so the manual beta job had a pending changeset to cut from.

## Verification

- `npm test` + `npm run typecheck` + `isa check`: pass locally.
- PR #1 checks: `All checks passed` green.
- Manual `Release` workflow run 32587299152 (workflow_dispatch from main): beta job green — `Publish to npm under the beta dist-tag` and `Tag and create GitHub prerelease` both succeeded.
- `npm view @d0ublecl1ck/isa-cli dist-tags` (official registry): `latest: 0.1.0`, `beta: 0.1.1-beta.1`.
- `gh release list`: `v0.1.1-beta.1` marked Pre-release. OIDC trusted publishing verified end-to-end with no npm token.

## Related ADRs

- None.
