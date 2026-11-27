# CT2 Notes -- Review Round 2

The notes of diff review round 2 for card CT2, Draft and release tags
([development-flow.md](https://github.com/huynguyennang-agilityio/tripmate-docs/blob/main/docs/development-flow.md), section 2.4).
The Decision column stays empty until EPIC-11 closes.

The review also found two defects. The product owner had both fixed in
this card: a deprecated optional response property inside array items,
`allOf`, `oneOf`, `anyOf`, or beside a `$ref` still failed when removed,
and `default`, `example`, `examples`, and `const` were skipped where
they are names, not schema keywords. The product owner also decided
notes 3 to 5 at once (EPIC-11 spec 2.8), and they are fixed in this
card too.

| Note | Level | Proposed fix | Priority | Decision |
|------|-------|--------------|----------|----------|
| `tests/INTERFACE.md` still says a breaking change is error level "plus any removed response property that is not writeOnly", with no deprecated exception, and only the code agent's own tests cover the deprecated rows of the spec. | Repository | The test agent updates `INTERFACE.md` and adds its own test for the deprecated rows. Done in CT2. | Medium | |
| The comment at the top of `scripts/check-breaking.js` says only error-level findings fail the check; the comment at the top of `.github/workflows/ci.yml` says every job is a required check, but `tag` is not. | Repository | Reword both comments. Done in CT2. | Low | |
| A required property or a path marked `deprecated` with a future `x-sunset` fails when removed (oasdiff `*-removed-before-sunset`, error level), while a deprecated optional property with a future `x-sunset` passes. | Epic | Spec 2.8: removing any deprecated item before its `x-sunset` date fails, optional ones too. Done in CT2. | Medium | |
| Adding an enum value to a response property is an oasdiff error, so it fails the check, while the version table treats it as a normal minor release. | Epic | Spec 2.8: it passes, and clients show an unknown value as a neutral fallback. Done in CT2. | Medium | |
| A narrowed response type, a widened request type, and a removed optional response header pass, because oasdiff rates them info; the spec's row "Changing a type" did not say which direction fails. | Epic | Spec 2.8: the type rows say which direction fails, and a removed response header fails like a removed response field. Done in CT2. | Low | |
| `scripts/contract-version.js` does not follow a path item `$ref` to `components.pathItems`: an `x-stub` operation defined there gives a release instead of a draft, and a new path that refers to an existing path item gives a patch instead of a minor version. FastAPI never writes `components.pathItems`. Found by the test-check after review round 2; the lead left it as a known limit. | Repository | Follow a path item `$ref` in `operations()` when a generator starts writing `components.pathItems`. | Low | |
