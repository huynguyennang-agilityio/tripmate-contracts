# Test interface

What the tests need from the code, and nothing more, card by card:

- CT1 Contracts repository and translation check: from the EPIC-11
  spec, section 2.9, api-design.md, section 6, architecture.md,
  section 7, and the task's scope, version 1.2 (cases CT1-1 to CT1-4),
  in the sections whose names start with "CT1".
- CT2 Draft and release tags: from the EPIC-11 spec, section 2.10
  (version 2.8), api-design.md, section 6, and the task's scope,
  version 1.4 (cases CT2-1 to CT2-9), in the sections whose names
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

- A field or an enum value counts wherever it is added: under any
  response, `responses.default` included, and in any component schema,
  one named `default` or `example` included (review round 2, defect 2).
- `default`, `example`, `examples`, `const`, and `x-*` are skipped only
  where they are keywords of a schema, never where they are the name of
  a response, a component schema, or a property. A `description` is not
  a field: adding only a description, also to a property named
  `properties`, is a patch (`v0.1.0` to `v0.1.1`).

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
  each reference, and applies the table of spec 2.10 (version 2.8),
  "The breaking-change check", to its findings:

| Change against a reference | The check |
|----------------------------|-----------|
| Removing an operation (CT2-4) | Fails |
| Removing a response field or a response header, required or optional (CT2-4, CT2-5) | Fails |
| Changing a type so that a client can no longer read or send it (widening a response type, narrowing a request type), or making a request field required | Fails |
| Removing an operation, a field, or a header marked `deprecated` before the date in its `x-sunset`, an optional field too | Fails |
| Removing a request field, or a `writeOnly` field (CT2-4) | Passes |
| Removing an operation, a field, or a header marked `deprecated`, with no `x-sunset` or after its date | Passes |
| Narrowing a response type, or widening a request type | Passes |
| Adding an optional field (CT2-6), or adding an enum value to a response field | Passes |

- A field is a response field wherever it is in the response schema:
  nested, in the items of an array (the response itself an array too),
  inside `allOf`, `oneOf`, or `anyOf`, in a `$ref`'d component, or under
  `responses.default`. The same holds for `deprecated`: a field is
  marked deprecated when its schema has `deprecated: true`, also when
  that schema is a `$ref` with `deprecated: true` beside it (OpenAPI
  3.1), and a name with `/` in it (`home/city`) is one field.
- `x-sunset` is a date `YYYY-MM-DD` on the deprecated operation,
  field schema, or header; the tests use `2099-12-31` as a date to come
  and `2020-01-01` as a date gone.
- A header is a response header of a response's `headers`; one marked
  deprecated has `deprecated: true` on the header object.
- `ok` is `true` and `problems` empty when nothing breaks against any
  reference, and when `references` is empty (no tag yet).
- Each problem's `tag` is the reference it breaks; its `message` names
  what broke: the removed property's name, the removed header's name
  (`X-Total-Count`), or the removed operation's path (`/old`).
- The oasdiff binary is the path in the environment variable
  `OASDIFF` when set, otherwise `oasdiff` on `PATH`. The tests do not
  install it; they need it to pass.

## CT2 Decisions of the lead (test-check, rounds 3 and 4)

The spec leaves these open; the lead decided them, and the tests in
`CT2-sunset-dates.test.js`, `CT2-deprecated-paths.test.js`, and
`CT2-version-more-places.test.js` check them. `CT2-sunset-dates.test.js`
also covers, at its end, the rows of the table above that had no test of
their own.

- C1, today: "today" for `x-sunset` is the UTC date for every kind of
  removal (optional field, required field, operation, header), also
  those oasdiff rates itself, whatever `TZ` the process runs with. An
  `x-sunset` of today (UTC) is reached: the removal passes; one of
  tomorrow (UTC) is not: it fails. The tests run the check in a child
  process with `TZ=Pacific/Pago_Pago` (UTC-11) and
  `TZ=Pacific/Kiritimati` (UTC+14).
- C2, the date format: `x-sunset` is read as oasdiff reads it, an
  RFC 3339 date `YYYY-MM-DD` or date-time (`2020-01-01T00:00:00Z`). A
  past one passes for every kind (an optional field and a header too).
  An invalid date (`2020-13-45`, `2020-02-30`) or any other malformed
  value (`2020-1-1`, `soon`, an empty string) fails the check for every
  kind.
- C3, a name with `/`: a removed name such as `home/city` can be read
  as one name or as `home` then `city`. When the schema has both and
  they disagree about `deprecated`, removing the one that is not
  deprecated fails (`home.city` removed, the deprecated `"home/city"`
  kept), and removing the deprecated one while the other remains passes.
- C4, depth: a deprecated field nested 60 levels of objects deep is
  found; removing it passes (removing one that is not deprecated fails).
- C5, where a field counts for the version (`nextTag`): adding a field
  under `$defs` (an entry named `default`), under `dependentSchemas`, in
  a webhook named `example` (`webhooks`), under a callback, or in the
  headers of an `encoding` entry named `default` gives
  `contracts-v0.2.0` after `contracts-v0.1.0`.

Round 4 of the test-check added these:

- P2, a date-time with an offset: an `x-sunset` date-time counts by the
  UTC date of its instant, for every kind (optional field, required
  field, operation, optional header, required header). With D today's
  UTC date, `<D>T23:30:00-05:00` (UTC date D+1) is not reached: the
  removal fails; `<D+1>T01:00:00+05:00` (UTC date D) is reached: it
  passes. The tests compute D when they run, and wait until UTC midnight
  has passed when it is less than 90 seconds away.
- P3, values refused: a value oasdiff or RFC 3339 refuses counts as not
  reached, for every kind: the leap second `2016-12-31T23:59:60Z`, the
  offset `+24:00` (`2020-01-01T00:00:00+24:00`), and `:60` seconds at a
  minute other than 23:59 (`2020-01-01T12:00:60Z`). The removal fails.
- P4, lowercase: a lowercase `t` or `z` (RFC 3339 allows it) is valid
  for every kind: the past `2020-01-01t00:00:00z` passes.
- P5, operations for the version (`nextTag`): adding an operation in
  `webhooks` (a new webhook, or a new method on an existing one) or in a
  callback (a new callback, or a new method in an existing one), even
  with no fields, gives `contracts-v0.2.0` after `contracts-v0.1.0`.

Round 5 of the test-check added this (`CT2-sunset-unchanged.test.js`):

- R1, unchanged items: a contract item that did not change never fails
  because of its `x-sunset`. When the reference and the new document
  are the same, each holding a deprecated operation, query parameter,
  response property (optional or required), or response header, the
  check passes (`ok`, no problem) whatever the form of its `x-sunset`:
  `<D>T23:30:00-05:00` (D today's UTC date), `2016-12-31T23:59:60Z`,
  `2030-01-01t00:00:00z`, `2099-1-1`, a number, a boolean, or
  `2099-12-31`. The date rules above apply to removals only.

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

## CT2 The command and the first tag

- `node scripts/contract-version.js`, run with the repository as its
  working directory, prints the next tag and a newline, or prints
  nothing when the merge gets no tag; it exits 0 either way and creates
  no tag.
- With no contract tag yet, the paths that count are every file in the
  repository at HEAD, not only those the merge changed (CT2-9, spec
  2.10 version 3.1). So a merge that changes only a script or a task
  file, in a repository whose `openapi.json` came with an older merge,
  gets `contracts-v0.1.0` (or `contracts-v0.1.0-draft.1` when an
  operation is a stub).
