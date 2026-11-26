# tripmate-contracts -- EPIC-11 Tasks: Platform Foundation

**Document type:** Task file\
**Epic:** EPIC-11, first part, Phase 1\
**Repository:** `tripmate-contracts`\
**Machine:** Mac 1\
**Spec:** [EPIC-11 spec](https://github.com/huynguyennang-agilityio/tripmate-docs/blob/main/docs/specs/epic-11/spec.md)\
**Status:** Proposed\
**Version:** 1.2

The tasks of EPIC-11 in this repository, in the order they start. Each task holds everything its Trello card will say ([development-flow.md](https://github.com/huynguyennang-agilityio/tripmate-docs/blob/main/docs/development-flow.md), section 1). The behaviour, the design, the order of the cards across repositories, and the checkpoints are in the spec, section 6.

Test case levels are the letters of [test-strategy.md](https://github.com/huynguyennang-agilityio/tripmate-docs/blob/main/docs/test-strategy.md), section 2. A case of level M has no automated test; it is shown once by hand and listed under Manual checks.

| Task | Title | Size | Risk | Depends on | Wave |
|------|-------|------|------|------------|------|
| [CT1](#ct1) | Contracts repository and translation check | S | High | F14 | 2 |
| [CT2](#ct2) | Draft and release tags | S | High | CT1, F12 | 3 |

## CT1

**CT1 Contracts repository and translation check**

**Facts**

| Fact | Value |
|------|-------|
| Epic | EPIC-11 |
| Repository | `tripmate-contracts` |
| Machine | Mac 1, wave 2 |
| Size | S |
| Risk | High: it adds CI, the flow checks, `CLAUDE.md`, and the agent roles |
| Depends on | F14 |
| Requirements | Language tests |
| Spec sections | 2.9, 2.12, 4.3 |

**Scope**

- `openapi.json`, `events.schema.json`, `translations/en/` and `translations/vi/` in place, one file per area.
- The translation check: every key in both languages, in the file of the same area, valid ICU, the same placeholders in both languages.
- The flow checks of 2.12, called from the backend's reusable workflow with this repository's path list.
- `CLAUDE.md`, `.gitattributes`, and the four agent roles (4.3).
- The checks of this repository are Node 24 scripts, tested with Vitest; ICU messages are read with `@formatjs/icu-messageformat-parser`, the parser `next-intl` uses on Web.
- A translation file is one flat JSON object; every key starts with the file's area, for example `auth.not_signed_in` in `translations/vi/auth.json`. A key in the file of another area fails the check.
- The path list: `openapi.json`, `events.schema.json`, CI, the checks, `CLAUDE.md`, the agent roles, and the dependencies are High; `translations/**`, and as in the backend `tests/**`, `tasks/**`, `README.md`, and `.gitignore`, are Low.
- Inside a plural or selectordinal, `{n}` of its own argument counts the same as `#`: `{n, plural, other {{n} items}}` and `{n, plural, other {# mục}}` have the same placeholders.

**Leaves out**

- Tags and the breaking-change check: CT2.

**Done when**

`openapi.json`, `events.schema.json`, `translations/en/` and `translations/vi/` in place, one file per area; the translation check of 2.9; the flow checks of 2.12; `CLAUDE.md` and the four agent roles (4.3)

**Test cases**

| Case | Kind | Given | Expected | Level |
|------|------|-------|----------|-------|
| CT1-1 | Main | Every key is in both languages, in the file of the same area, with valid ICU | The translation check passes | C |
| CT1-2 | Error | A key is in one language only | The check fails and names the key | C |
| CT1-3 | Error | A message with broken ICU syntax | The check fails and names the key | C |
| CT1-4 | Edge | A message whose two languages use different placeholders | The check fails and names the key | C |

**Manual checks**

None.

## CT2

**CT2 Draft and release tags**

**Facts**

| Fact | Value |
|------|-------|
| Epic | EPIC-11 |
| Repository | `tripmate-contracts` |
| Machine | Mac 1, wave 3 |
| Size | S |
| Risk | High: it changes how contract versions are tagged |
| Depends on | CT1, F12 |
| Requirements | Cross-client API contract tests |
| Spec sections | 2.10 |

**Scope**

- A draft tag `contracts-vX.Y.Z-draft.N` when any operation is a stub, the next draft number on each merge; a release tag `contracts-vX.Y.Z` otherwise.
- The breaking-change check against the last release tag and the latest draft; adding an optional field passes.

**Leaves out**

- Pinning a version in Web and Mobile: WF2 and MF2.

**Done when**

2.10: a draft tag when any operation is a stub, a release tag otherwise; the breaking-change check against the last tag and the latest draft

**Test cases**

| Case | Kind | Given | Expected | Level |
|------|------|-------|----------|-------|
| CT2-1 | Main | A merged contract with one operation marked `x-stub` | A draft tag, `contracts-vX.Y.Z-draft.1` | C |
| CT2-2 | Edge | A second merge while a stub remains | `draft.2` of the same version | C |
| CT2-3 | Main | A merged contract with no stub | A release tag, `contracts-vX.Y.Z` | C |
| CT2-4 | Error | A change that removes a field, against the last release tag | The breaking-change check fails | C |
| CT2-5 | Error | A change that breaks the latest draft | The check fails | C |
| CT2-6 | Edge | A change that only adds an optional field | The check passes | C |

**Manual checks**

- [ ] Checkpoint: Together with WF2 and MF2: a stub route becomes a draft tag, and the test screen on Web and on Mobile shows its example in mock mode. EPIC-01 can start with B0.

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-11-25 | First version: the 2 tasks of EPIC-11 in this repository, moved from the EPIC-11 spec, sections 6 and 7, with scope, what each leaves out, the reason for its risk level, and its manual checks. The skeleton tasks write four agent roles, as development-flow.md now says. |
| 1.1 | 2026-11-26 | CT1 scope, as the product owner decided before the tests: the checks are Node 24 scripts with Vitest and the `next-intl` ICU parser; flat translation keys that start with the file's area; `translations/**` is Low on the path list. |
| 1.2 | 2026-11-26 | CT1 scope, as the product owner decided after review round 1: `tests/**`, `tasks/**`, `README.md`, and `.gitignore` are Low as in the backend; `{n}` inside its own plural counts as `#`. |
