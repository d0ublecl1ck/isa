---
id: 62e9b
status: in-progress
created_at: 2026-08-22T17:14:30.725Z
updated_at: 2026-08-22T17:15:18.736Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-22T17:15:18.736Z
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

- [ ] `RELEASE-SETUP.md` reflects the completed configuration.
- [ ] Manual beta run publishes `@d0ublecl1ck/isa-cli` to the `beta` dist-tag and creates a prerelease GitHub Release.

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
