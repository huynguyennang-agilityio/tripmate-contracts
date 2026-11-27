# Test interface

What the tests need from the code, and nothing more, card by card:

- CT1 Contracts repository and translation check: from the EPIC-11
  spec, section 2.9, api-design.md, section 6, architecture.md,
  section 7, and the task's scope, version 1.2 (cases CT1-1 to CT1-4),
  in the sections whose names start with "CT1".
- CT2 Draft and release tags: from the EPIC-11 spec, section 2.10
  (version 2.5), api-design.md, section 6, and the task's scope,
  version 1.3 (cases CT2-1 to CT2-8), in the sections whose names
  start with "CT2".

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
  and they hold only `.json` files. Files the operating system writes,
  `.DS_Store`, `Thumbs.db`, and `desktop.ini`, in `translations/` or in
  a language folder, are ignored (review round 1).
- A file may start with a UTF-8 byte order mark; it is read as the JSON
  after it (review round 1).
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
| CT1-2 | The key does not start with its file's area and a dot; the problem names that file (in `file` or in `message`). That copy is not compared with the key's copy in its own area: for `b.x` in `en/a.json`, with `b.x` also in `en/b.json` and `vi/b.json`, the wrong-area problem is the only problem for `b.x` (review round 1) |
| CT1-2 | A value is not a string (a nested object, a number): the problem names the key |
| CT1-2 | A file is not valid JSON (for example merge-conflict markers), a folder other than `en` and `vi`, or a file that is not `.json`: the problem names the file or folder (in `file` or in `message`); `key` may be `null` |
| CT1-2 | A language folder is missing (for example only `en/` is present) |
| CT1-3 | The message is not valid ICU for `@formatjs/icu-messageformat-parser` with its default options (so a plural or select without `other` is invalid) |
| CT1-4 | The two languages do not have the same placeholders: the set of argument names, each with its type (plain argument, number, date, time, plural, select, selectordinal, tag), arguments nested inside branches and tags included. An argument in one language only, a different type (number vs plain, date vs time, selectordinal vs plural, select vs plural), or a different name (names are case-sensitive) is a problem. Plural and select branches may differ. Inside a plural or selectordinal, `{n}` of its own argument counts as `#` (task 1.2): `{n, plural, other {{n} items}}` and `{n, plural, other {# mục}}` match; `{m}` there is a different argument |

## CT1 The check as a command

```sh
node scripts/check-translations.js [dir]   # dir defaults to translations, from the working directory
```

- The script path may be relative and the working directory any
  directory; `dir` is resolved from the working directory.
- Exit code 0 when there is no problem.
- A non-zero exit code otherwise, with every problem's key printed to
  standard output or standard error (for a file or folder problem, the
  file or folder name).
- A `dir` that does not exist is a problem: a non-zero exit code with
  the directory's name printed, never exit 0 silently (review round 1).

## CT1 CI

- `.github/workflows/ci.yml` has a job `translations` whose steps run
  `npm test` and `node scripts/check-translations.js` (CT1-1, read as
  text).

## CT2 Tags

- A release tag is `contracts-vX.Y.Z`; a draft tag is
  `contracts-vX.Y.Z-draft.N`, `N` from 1.
- Tags are ordered by version: `X.Y.Z-draft.N` comes before
  `X.Y.Z-draft.N+1`, and every draft of `X.Y.Z` before the release
  `X.Y.Z`. The order of a list of tag names carries no meaning (`git
  tag` lists them alphabetically). The last tag is the highest; the last
  release tag is the highest release; the latest draft is the highest
  draft.
- A tag name that does not start with `contracts-v` is ignored.
- An operation is a stub when it has `x-stub: true` (an operation is a
  method `get`, `put`, `post`, `delete`, `options`, `head`, `patch`, or
  `trace` under a path in `paths`).

## CT2 The next tag as a module

`scripts/contract-version.js` is an ES module that exports:

```js
nextTag({ tags, changedPaths, contract, previousContract })
// returns the next tag name, for example "contracts-v0.1.0-draft.1", or null for no tag
```

- `tags`: the names of the existing tags, in any order (may be empty).
- `changedPaths`: the paths the merge changed, relative to the
  repository root with `/`, for example `translations/en/auth.json`.
- `contract`: the parsed `openapi.json` after the merge.
- `previousContract`: the parsed `openapi.json` at the last tag, or
  `null` when there is no tag.
- Pure: no git, no file read, no network.

The result, from the table in spec 2.10:

| Case | Last tag | The merge | Result |
|------|----------|-----------|--------|
| CT2-8 | Any | Changes none of `openapi.json`, `events.schema.json`, a file under `translations/` (for example only `README.md` or `tasks/EPIC-11.md`) | `null` |
| CT2-1 | None | Any operation is a stub | `contracts-v0.1.0-draft.1` |
| CT2-3 | None | No stub | `contracts-v0.1.0` |
| CT2-1 | Release `X.Y.Z` | Any operation is a stub | `contracts-vX.(Y+1).0-draft.1` (`v1.3.0` to `v1.4.0-draft.1`) |
| CT2-3 | Release `X.Y.Z` | No stub; `contract` adds an operation, a field, or an enum value to `previousContract`, or `changedPaths` has `events.schema.json` | `contracts-vX.(Y+1).0` |
| CT2-7 | Release `X.Y.Z` | No stub; any other change, such as translations only | `contracts-vX.Y.(Z+1)` (`v0.1.0` to `v0.1.1`) |
| CT2-2 | Draft `X.Y.Z-draft.N` | Any operation is a stub | `contracts-vX.Y.Z-draft.(N+1)` |
| CT2-3 | Draft `X.Y.Z-draft.N` | No stub | `contracts-vX.Y.Z` |

## CT2 The breaking-change check as a module

`scripts/check-breaking.js` is an ES module that exports:

```js
referenceTags(tags)
// returns the tag names to compare with: the last release tag, and the latest
// draft when it is newer than that release; [] when there is no tag

checkBreaking(file, references)
// file: path of the new openapi.json
// references: [{ tag, file }], the openapi.json at each reference tag (may be empty)
// returns { ok, problems } or a Promise of it
// problems: [{ tag, message }]
```

- `referenceTags` is pure. Its order is not fixed.
- `checkBreaking` runs `oasdiff breaking <reference file> <file>` for
  each reference. A breaking change is what oasdiff reports at level
  error, plus any removed response property that is not writeOnly:
  removing an operation or a field (a required response property,
  CT2-4 and CT2-5; an optional response property too, which oasdiff
  rates below error, CT2-4 as the product owner decided), changing a
  type, making a request field required. Adding an optional field
  passes (CT2-6). A property with `writeOnly: true` is not a response
  field: removing it from a schema used in a response passes (CT2-4,
  as the product owner decided).
- `ok` is `true` and `problems` empty when nothing breaks against any
  reference, and when `references` is empty (no tag yet).
- Each problem's `tag` is the reference it breaks; its `message` names
  what broke, for example the removed property's name.
- The oasdiff binary is the path in the environment variable
  `OASDIFF` when set, otherwise `oasdiff` on `PATH`. The tests do not
  install it; they need it to pass.

## CT2 The breaking-change check as a command

```sh
node scripts/check-breaking.js [file]   # file defaults to openapi.json, from the working directory
```

- Run in a git repository (the working directory). It reads the tags
  of that repository, picks them with `referenceTags`, and compares
  `file` with `openapi.json` at each picked tag.
- Exit code 0 when nothing breaks (and with no tag); non-zero
  otherwise, with each problem's tag and message printed to standard
  output or standard error (CT2-4).
