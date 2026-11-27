// CT2 Draft and release tags: case CT2-4, where the check looks up `deprecated` for a removed
// field (EPIC-11 spec 2.8, section 2.10), with the lead's decisions on what the spec leaves open
// (test-check, round 3):
// C3: a removed name with `/` can be read as one name (`"home/city"`) or as nested names
//     (`home` then `city`); when the readings disagree about `deprecated`, removing the field
//     that is not deprecated fails, and removing the deprecated one while the other remains passes.
// C4: a deprecated field nested 60 levels deep is found: removing it passes.
// The interface is in tests/INTERFACE.md.
import { test, afterEach } from "vitest";
import { check, doc, expectFails, expectPasses, obj, removeTempDirs, str } from "./CT2-rules-helpers.js";

afterEach(removeTempDirs);

// A response with `"home/city"` (deprecated) and `home` with `city` (not deprecated).
const both = () => obj({ id: str(), "home/city": str({ deprecated: true }), home: obj({ city: str(), zip: str() }) });

test("CT2-4 C3 removing home.city (not deprecated) while a deprecated \"home/city\" remains fails the check", async () => {
  const after = obj({ id: str(), "home/city": str({ deprecated: true }), home: obj({ zip: str() }) });
  expectFails(await check(doc(both()), doc(after)), "city");
});

test("CT2-4 C3 removing the deprecated \"home/city\" while home.city remains passes the check", async () => {
  const after = obj({ id: str(), home: obj({ city: str(), zip: str() }) });
  expectPasses(await check(doc(both()), doc(after)));
});

// `leaf` inside 60 levels of objects, l59 outermost.
function nest(leaf, depth = 60) {
  let schema = leaf;
  for (let i = 0; i < depth; i++) schema = obj({ [`l${i}`]: schema });
  return schema;
}

test("CT2-4 C4 removing a deprecated field nested 60 levels deep passes the check", async () => {
  const before = doc(nest(obj({ id: str(), nickname: str({ deprecated: true }) })));
  const after = doc(nest(obj({ id: str() })));
  expectPasses(await check(before, after));
});

test("CT2-4 C4 removing a field that is not deprecated, nested 60 levels deep, fails the check", async () => {
  const before = doc(nest(obj({ id: str(), nickname: str() })));
  const after = doc(nest(obj({ id: str() })));
  expectFails(await check(before, after), "nickname");
});
