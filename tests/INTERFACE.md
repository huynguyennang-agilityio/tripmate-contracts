# Test interface

What the tests need from the code, and nothing more, card by card:

- CT1 Contracts repository and translation check: from the EPIC-11
  spec, section 2.9, api-design.md, section 6, architecture.md,
  section 7, and the task's scope, version 1.1 (cases CT1-1 to CT1-4),
  in the sections whose names start with "CT1".

## Running the tests

- Node 24; `npm ci`, then `npm test` (`vitest run`) from the
  repository root.
- Tests are ES modules (`"type": "module"`), under `tests/<level>/`,
  named `<card>-<subject>.test.js`. Level C (contract) tests are in
  `tests/contract/`.
- Fixtures are written to temporary directories and removed after each
  test.

## CT1 Translation layout

- `translations/<lang>/<area>.json`, where `<lang>` is `en` or `vi`.
- Each file is one flat JSON object whose values are strings, in ICU
  message format.
- Every key starts with `<area>.`, where `<area>` is the file name
  without `.json`, and its dot, for example `auth.not_signed_in` in
  `translations/vi/auth.json` (`authx.title` there is in the wrong area).
- `translations/` holds only the folders `en` and `vi`, both present,
  and they hold only `.json` files.
- The repository's own `translations/en/` and `translations/vi/` exist,
  hold at least one area file, and pass the check (CT1-1).

## CT1 The check as a module

`scripts/check-translations.js` is an ES module that exports:

```js
checkTranslations(dir) // dir: path of a translations directory
// returns { problems } or a Promise of it
// problems: [{ key, message, lang?, file? }]
```

- `key`: the translation key the problem is about, or `null` when the
  problem is about a whole file or folder; `file` (or `message`) then
  names it.
- `message`: a text saying what is wrong.
- `lang` (optional): `en` or `vi`, where useful.
- `file` (optional): the file, relative to `dir`, for example
  `vi/auth.json`.
- `problems` is empty when the translations are clean, and holds every
  problem found otherwise (not only the first).

A problem is reported, naming the key (or, for a file or folder, the
file), when:

| Case | Problem |
|------|---------|
| CT1-2 | The key is in one language only, including every key of a file that exists in one language only |
| CT1-2 | The key does not start with its file's area and a dot; the problem names that file (in `file` or in `message`) |
| CT1-2 | A value is not a string (a nested object, a number): the problem names the key |
| CT1-2 | A file is not valid JSON (for example merge-conflict markers), a folder other than `en` and `vi`, or a file that is not `.json`: the problem names the file or folder (in `file` or in `message`); `key` may be `null` |
| CT1-2 | A language folder is missing (for example only `en/` is present) |
| CT1-3 | The message is not valid ICU for `@formatjs/icu-messageformat-parser` with its default options (so a plural or select without `other` is invalid) |
| CT1-4 | The two languages do not have the same placeholders: the set of argument names, each with its type (plain argument, number, date, time, plural, select, selectordinal, tag), arguments nested inside branches and tags included. An argument in one language only, a different type (number vs plain, date vs time, selectordinal vs plural, select vs plural), or a different name (names are case-sensitive) is a problem. Plural and select branches may differ |

## CT1 The check as a command

```sh
node scripts/check-translations.js [dir]   # dir defaults to translations, from the working directory
```

- Exit code 0 when there is no problem.
- A non-zero exit code otherwise, with every problem's key printed to
  standard output or standard error (for a file or folder problem, the
  file or folder name).

## CT1 CI

- `.github/workflows/ci.yml` has a job `translations` whose steps run
  `npm test` and `node scripts/check-translations.js` (CT1-1, read as
  text).
