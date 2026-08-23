# Design: converge-readme-releasing-relocate-release-setup

## Context

`README.md` lines 118–120 hold a publisher-perspective `### Releasing` section (release mechanics plus credential-setup pointer). `.github/RELEASE-SETUP.md` is a one-time owner-side credential checklist whose status header already records "2026-08-22: all complete". The only in-repo references to the checklist are the README link and historical closed issue documents under `docs/issues/closed/`. See proposal.md — Why for motivation.

## Goals / Non-Goals

**Goals:**

- README Releasing section reads as community-facing: what a user/contributor needs to know (releases are automated, merging the version PR publishes), nothing about credentials.
- The checklist remains available to maintainers at a maintainer-scoped location, clearly labeled as such, with its content otherwise byte-identical.
- Zero broken links after the move.

**Non-Goals:**

- Rewriting or trimming the checklist content itself.
- Changing release automation (`.github/workflows/`, `.changeset/`).
- Back-editing historical records in `docs/issues/closed/` that mention the old path — they describe history as it was.

## Decisions

- **New location: `docs/release-setup.md`** (lowercase, matching repo doc conventions) over keeping it in `.github/` or moving it into an issue document. `.github/` is contributor-facing surface (PR templates, workflows, CODEOWNERS); a completed one-time credential checklist is maintainer reference material, and `docs/` is where this repo keeps long-lived documentation. Alternative considered: deleting the file outright — rejected, because it is the runbook for re-configuring or migrating publishing credentials.
- **Header notice over front-matter**: a `> **Maintainer document** …` blockquote at the top of `docs/release-setup.md`, visible in any renderer, instead of YAML front matter that GitHub hides.
- **README wording**: one to two sentences in the same register as neighboring sections, e.g. "Releases are automated with Changesets: merging the automated `chore(release): version packages` PR publishes the package to npm and creates the GitHub Release." No mention of beta dispatch mechanics or credential setup — maintainer concerns, not community ones.
- **Historical references stay**: mentions of `.github/RELEASE-SETUP.md` inside `docs/issues/closed/*.md` are point-in-time records and are not rewritten.

## Risks / Trade-offs

- [External deep links to `.github/RELEASE-SETUP.md` on GitHub break] → Low likelihood (file is a one-time checklist, not linked from outside sources we're aware of); mitigated by keeping full content at a discoverable `docs/` path.
- [README loses the beta install hint some early adopters used] → Acceptable: beta was a one-off verification channel, and the prerelease workflow remains documented in the moved maintainer doc.
