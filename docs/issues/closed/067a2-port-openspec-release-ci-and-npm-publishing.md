---
id: 067a2
status: closed
created_at: 2026-08-22T05:12:44.528Z
updated_at: 2026-08-22T05:28:32.731Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-22T05:13:55.511Z
closed_at: 2026-08-22T05:28:32.731Z
---

# Port OpenSpec release CI and npm publishing

## Background

ISA is published as the npm package `isa-cli`, but the repository had no release automation: no CI matrix, no versioning flow, no npm publishing pipeline. OpenSpec (`Fission-AI/OpenSpec`) runs a proven Changesets + GitHub Actions flow with npm OIDC trusted publishing. Porting it gives ISA reproducible releases with no long-lived npm tokens. Requested as Multica TASK-19 (assignee: frontend engineer); this document was backfilled by the backend architect while splitting the mixed worktree into per-issue commits.

## Scope

- `release.yml`: on push to `main`, `changesets/action` opens/updates the "version packages" PR; merging it runs `changeset publish` with npm OIDC trusted publishing and creates GitHub Releases. Manual `workflow_dispatch` beta prerelease (`-beta.N`, npm `beta` dist-tag, prerelease GitHub Release, no changeset consumption, resumable after interruption).
- `ci.yml`: PR/push test matrix (Linux/macOS/Windows × Node 20/24, coverage upload on Node 24), `npm run typecheck` via new `tsconfig.test.json`, changeset validation job, and an `All checks passed` aggregate (merge-queue compatible).
- `security.yml`: PR dependency review (high-severity blocking) plus `npm audit` (warn on PRs, block high severity on `main` pushes and weekly schedule).
- `package.json`: `release:ci`, `prepublishOnly`, `typecheck`, `changeset` scripts, `publishConfig.access: public`, devDeps `@changesets/cli` + `@changesets/changelog-github`.
- `.changeset/config.json` (GitHub changelog, `access: public`, `baseBranch: main`), `.github/RELEASE-SETUP.md` owner setup checklist, README Releasing section.
- Third-party actions pinned by SHA, matching OpenSpec's versions.

## Non-goals

- No migration from npm to pnpm (OpenSpec uses pnpm; ISA stays on npm).
- Owner-side credential setup (npm trusted publisher, GitHub App) is documented, not automated.
- No changes to CLI runtime code.

## Acceptance Criteria

- [x] Push to `main` produces/updates a version-packages PR; merging publishes to npm via OIDC and creates a GitHub Release.
- [x] Manual dispatch publishes a `-beta.N` prerelease to the `beta` dist-tag without consuming changesets, resumable after interruption.
- [x] PRs run the test matrix, typecheck, changeset validation, and dependency review; `All checks passed` aggregates the gates.
- [x] `npm run build`, `npm run typecheck`, `npm test`, `npm pack --dry-run` pass locally; all workflow YAML/JSON parses.
- [x] Owner setup steps documented in `.github/RELEASE-SETUP.md`.

## Implementation

Delivered by the frontend engineer under Multica TASK-19; files: `.github/workflows/{release,ci,security}.yml`, `.github/RELEASE-SETUP.md`, `.changeset/config.json`, `package.json`, `package-lock.json`, `tsconfig.test.json`, README Releasing section.

Follow-up from review (tracked in Multica TASK-19, resolved): the `All checks passed` aggregate jobs in `ci.yml` now `needs:` the `validate-changesets` job and block on its `failure`/`cancelled` result (`skipped` on `push` treated as pass), so an invalid changeset cannot bypass the gate under the recommended branch-protection setup. Fixed in commit `87491ad` "Gate aggregate checks on validate-changesets".

## Verification

- Local by implementer: `npm run build` ✅, `npm run typecheck` ✅, `npm test` 113/113 ✅, `npm pack --dry-run` 17 files ✅, workflow YAML/JSON parse ✅, beta version computation smoke-tested via `changeset status`.
- Reviewer re-verified the same commands and confirmed all six SHA-pinned actions resolve via the GitHub API.

## Related ADRs

- None.
