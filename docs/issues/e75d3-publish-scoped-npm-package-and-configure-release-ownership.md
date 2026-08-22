---
id: e75d3
status: in-progress
created_at: 2026-08-22T08:11:34.546Z
updated_at: 2026-08-22T08:12:01.778Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-22T08:12:01.778Z
---

# Publish scoped npm package and configure release ownership

## Background

The release workflow is ready, but the unscoped `isa-cli` name is owned by an unrelated npm package. The repository also needs a package name that can be published by this project and owner-side GitHub/npm configuration.

## Scope

- Rename the package to `@d0ublecl1ck/isa-cli` while keeping the installed CLI binary as `isa`.
- Update package metadata, lockfile, README, and release setup references.
- Validate the package build, tests, type checks, and publish artifact.
- Document the owner-side GitHub repository, npm trusted publisher, GitHub App, Actions variables/secrets, and branch protection setup.

## Non-goals

- Do not claim or modify the unrelated `isa-cli` package owned by another npm maintainer.
- Do not commit private keys, npm tokens, or GitHub App credentials.
- Do not automate owner-side npm/GitHub web settings from the repository.

## Acceptance Criteria

- [x] Package metadata uses `@d0ublecl1ck/isa-cli`; the binary remains `isa`.
- [x] All repository-facing install and release instructions use the scoped package name.
- [x] Build, tests, type checks, and package inspection pass.
- [ ] `d0ublecl1ck/isa` is the configured Git remote and `main` is pushed.
- [x] Owner-side configuration steps and exact required names are documented for npm and GitHub.

## Implementation

- Renamed `package.json` and the lockfile root package to `@d0ublecl1ck/isa-cli`; preserved the `isa` executable name and public publish access.
- Updated README installation text, beta commands, npm package checks, and release setup documentation.
- Added `src/package-metadata.test.ts` to assert the scoped package name, executable, and publish access.
- Created the public GitHub repository `d0ublecl1ck/isa` and configured it as `origin`.
- Review follow-up: the `archkit inspect --init` / `archkit design init` materialization (`quality-gates/`, `.inspectignore`, `docs/design.md`) was reverted — this repository is managed by ISA itself (`isa check`), and ArchKit gate scaffolding was never adopted here.


## Verification

- TDD Red: `npx vitest run src/package-metadata.test.ts` failed on the old `isa-cli` name.
- TDD Green: the same test passed after the metadata update.
- `npm ci --ignore-scripts --no-audit --no-fund` passed.
- `npm test` passed: 120 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run test:coverage` passed.
- `npm pack --dry-run --json --ignore-scripts --registry=https://registry.npmjs.org` produced `@d0ublecl1ck/isa-cli@0.1.0` with 17 files.
- `isa check` passed with every issue document valid.

## Related ADRs

- None.
