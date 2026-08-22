---
id: "83e26"
status: in-progress
created_at: 2026-08-22T17:35:35.050Z
updated_at: 2026-08-22T17:36:05.950Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-22T17:36:05.950Z
---

# Land README rewrite on main with corrected package name and release status

## Background

The OpenSpec-modeled README rewrite delivered under 829d0 (plus the CI dogfood step from 0b596) was reviewed but never merged into `main`; `main` still ships the old README, which claims the package is "pending its first npm publish". Since then the package was renamed to `@d0ublecl1ck/isa-cli` and 0.1.0/0.1.1 were published via Changesets + GitHub Actions + npm OIDC trusted publishing. The rewrite must land on `main` with package name, install commands, and release status updated to current reality.

## Scope

- Rewrite `README.md` using the reviewed OpenSpec-modeled structure as the skeleton.
- Use `@d0ublecl1ck/isa-cli` everywhere (npm badge, install command, references); remove any "pending first publish" wording.
- Keep the `Validate issue documents (dogfood)` step in `ci.yml` (typecheck job) without breaking the `All checks passed` aggregation.
- Verify every command/flag row in the README against `src/cli.ts` and the Releasing section against `.github/workflows/release.yml` and `.github/RELEASE-SETUP.md`.

## Non-goals

- No CLI behavior changes; documentation and CI wiring only.
- No changes to the release workflow or credential setup.

## Acceptance Criteria

- [x] README uses `@d0ublecl1ck/isa-cli` in badge, install command, and all references; no unscoped `isa-cli` npm references remain.
- [x] README contains no "pending first publish" / 待首次发布 wording.
- [x] Command table and flags match `src/cli.ts`; Releasing/Development sections match `release.yml`, `ci.yml`, and `RELEASE-SETUP.md`.
- [x] `ci.yml` runs `node dist/cli.js check` (dogfood) inside the typecheck job; `All checks passed` jobs unchanged.
- [x] `npm run build`, `npm test`, `npm run typecheck`, and `node dist/cli.js check` all pass.

## Implementation

- Rewrote `README.md` using the reviewed OpenSpec-modeled structure (hero badges, philosophy, see-it-in-action demo, comparison, quick start, command table, trailer contract, GitHub mirror, agent skill, development, releasing).
- Corrected all package references to `@d0ublecl1ck/isa-cli` (npm badge URL + shields src, `npm install -g` command, releasing section, beta dist-tag install command); no unscoped `isa-cli` npm references remain and no "pending first publish" wording exists.
- Verified the command table and every flag against `src/cli.ts` (`ACTIONS` set, HELP text, `parseArgs` flags); verified demo output strings against `src/init.ts` / `src/commands.ts`; verified sync claims against `src/sync.ts`; confirmed `action.yml` and `skills/isa/SKILL.md` + `SKILL.zh.md` exist.
- Added the `Validate issue documents (dogfood)` step to the `typecheck` job in `.github/workflows/ci.yml` (runs `node dist/cli.js check` after the build-artifact check); the `All checks passed` aggregation jobs and their `needs` lists are unchanged.

## Verification

- `npm run build` — pass (tsc).
- `npm test` — 7 test files, 120 tests, all pass.
- `npm run typecheck` — pass (`tsc --noEmit -p tsconfig.test.json`).
- `node dist/cli.js check` — "All Issues-as-Code documents are valid."
- `grep -n "isa-cli" README.md | grep -v "@d0ublecl1ck/isa-cli"` — empty; `grep -in "pending" README.md` — empty.

## Related ADRs

- None.
