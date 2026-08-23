# Tasks: converge-readme-releasing-relocate-release-setup

## 1. README

- [x] 1.1 Rewrite the `### Releasing` section of `README.md` as a brief community-facing note (1–2 sentences: Changesets automation; merging the version PR publishes to npm), removing credential-setup guidance and the `./.github/RELEASE-SETUP.md` link.

## 2. Relocate maintainer doc

- [x] 2.1 `git mv .github/RELEASE-SETUP.md docs/release-setup.md`.
- [x] 2.2 Add a maintainer-facing notice blockquote at the top of `docs/release-setup.md` (maintainer audience + one-time setup already completed 2026-08-22); leave the rest of the content unchanged.

## 3. References

- [x] 3.1 Grep the repo for `RELEASE-SETUP` and update any live references (exclude `docs/issues/closed/` historical records) to point at `docs/release-setup.md`.

## 4. Verification

- [x] 4.1 `npm run build`, `npm test`, `npm run typecheck` pass.
- [x] 4.2 `node dist/cli.js check` passes.
- [x] 4.3 `openspec validate converge-readme-releasing-relocate-release-setup --strict` passes.
- [x] 4.4 Update ISA issue `581d6` Implementation/Verification sections and acceptance checkboxes, then close per ISA flow.
