# CT1 Notes -- Review Round 2

The notes of diff review round 2 for card CT1, Contracts repository and translation check
([development-flow.md](https://github.com/huynguyennang-agilityio/tripmate-docs/blob/main/docs/development-flow.md), section 2.4).
The Decision column stays empty until EPIC-11 closes.

| Note | Level | Proposed fix | Priority | Decision |
|------|-------|--------------|----------|----------|
| On Node below 24.2, `import.meta.main` is `undefined`, so `node scripts/check-translations.js` prints nothing and exits 0 even with broken translations (`scripts/check-translations.js`, the CLI entry); `engines` only warns through npm. CI is safe because it pins Node 24. | Repository | Before the entry check, fail loudly when `typeof import.meta.main !== "boolean"`: print "Node 24.2 or later is required" and exit 2. | Medium | |
| The backend's reusable `flow-checks.yml` has no Node setup, so `npm ci` and, after F15, the Vitest run use whatever Node the runner image has. | Project | In F15 (already in its scope): a `node-version` input with a pinned `actions/setup-node` step; `flow.yml` passes `24`. | Medium | |
| The JavaScript test lock covers only files under `tests/`. A commit without the trailer can change which tests run through a new `vitest.config.*` or the `test` script in `package.json`, and a `*.test.js` outside `tests/` is never locked. The risk gate makes these High today, which is review, not the lock. | Project | In F15: treat `vitest.config.*` and `vite.config.*` like `conftest.py`, and lock `*.test.js` and `*.spec.js` wherever they are. | Low | |
| Only a plain `{n}` inside its own plural counts as `#`; `{n, number}` of the same argument still counts as a number, so en `{n, plural, other {{n, number} items}}` against vi `{n, plural, other {# mục}}` fails. This matches task 1.2, which names only `{n}`. | Epic | The product owner decides whether `{n, number}` of the plural's own argument also counts as `#`; if yes, add a case and skip it in the check. | Low | |
