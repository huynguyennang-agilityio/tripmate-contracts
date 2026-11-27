// CT2 Draft and release tags: case CT2-4, the rows of the breaking-change table in EPIC-11 spec
// 2.8 (section 2.10) about items marked `deprecated`. Removing an operation or a field marked
// deprecated, with no x-sunset or after its date, passes, wherever the field is in the response
// schema (review round 2, defect 1); removing one before the date in its x-sunset fails, an
// optional field too. The interface is in tests/INTERFACE.md.
import { test, afterEach } from "vitest";
import {
  FUTURE_SUNSET,
  PAST_SUNSET,
  check,
  doc,
  expectFails,
  expectPasses,
  obj,
  removeTempDirs,
  str,
  withOldOperation,
} from "./CT2-rules-helpers.js";

afterEach(removeTempDirs);

// The response keeps `id`; `nickname` is the field removed.
const kept = { id: str() };

// The deprecated rows of the table, no x-sunset.

test("CT2-4 removing a deprecated optional response field with no x-sunset passes the check", async () => {
  const before = doc(obj({ ...kept, nickname: str({ deprecated: true }) }, ["id"]));
  const after = doc(obj(kept, ["id"]));
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated required response field with no x-sunset passes the check", async () => {
  const before = doc(obj({ ...kept, nickname: str({ deprecated: true }) }, ["id", "nickname"]));
  const after = doc(obj(kept, ["id"]));
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated operation with no x-sunset passes the check", async () => {
  const base = doc(obj(kept, ["id"]));
  expectPasses(await check(withOldOperation(base, { deprecated: true }), base));
});

// Defect 1: a deprecated optional field wherever it is in the response schema.

test("CT2-4 removing a deprecated optional field from the items of a response array passes the check", async () => {
  const before = doc(obj({ trips: { type: "array", items: obj({ ...kept, nickname: str({ deprecated: true }) }) } }));
  const after = doc(obj({ trips: { type: "array", items: obj(kept) } }));
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated optional field from the items of a top-level response array passes the check", async () => {
  const before = doc({ type: "array", items: obj({ ...kept, nickname: str({ deprecated: true }) }) });
  const after = doc({ type: "array", items: obj(kept) });
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated optional field inside allOf passes the check", async () => {
  const before = doc({ allOf: [obj({ ...kept, nickname: str({ deprecated: true }) })] });
  const after = doc({ allOf: [obj(kept)] });
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated optional field inside oneOf passes the check", async () => {
  const other = obj({ code: { type: "integer" } }, ["code"]);
  const before = doc({ oneOf: [obj({ ...kept, nickname: str({ deprecated: true }) }), other] });
  const after = doc({ oneOf: [obj(kept), other] });
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated optional field inside anyOf passes the check", async () => {
  const other = obj({ code: { type: "integer" } }, ["code"]);
  const before = doc({ anyOf: [obj({ ...kept, nickname: str({ deprecated: true }) }), other] });
  const after = doc({ anyOf: [obj(kept), other] });
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated optional field that is a $ref with deprecated: true beside it passes the check", async () => {
  const components = { Place: obj({ name: str() }) };
  const before = doc(obj({ ...kept, place: { $ref: "#/components/schemas/Place", deprecated: true } }), { components });
  const after = doc(obj(kept), { components });
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated optional field whose name has a / passes the check", async () => {
  const before = doc(obj({ ...kept, "home/city": str({ deprecated: true }) }));
  const after = doc(obj(kept));
  expectPasses(await check(before, after));
});

// x-sunset: before its date the removal fails; after it the removal passes.

test("CT2-4 removing a deprecated optional response field before the date in its x-sunset fails the check", async () => {
  const before = doc(obj({ ...kept, nickname: str({ deprecated: true, "x-sunset": FUTURE_SUNSET }) }, ["id"]));
  const after = doc(obj(kept, ["id"]));
  expectFails(await check(before, after), "nickname");
});

test("CT2-4 removing a deprecated required response field before the date in its x-sunset fails the check", async () => {
  const before = doc(
    obj({ ...kept, nickname: str({ deprecated: true, "x-sunset": FUTURE_SUNSET }) }, ["id", "nickname"]),
  );
  const after = doc(obj(kept, ["id"]));
  expectFails(await check(before, after), "nickname");
});

test("CT2-4 removing a deprecated operation before the date in its x-sunset fails the check", async () => {
  const base = doc(obj(kept, ["id"]));
  expectFails(await check(withOldOperation(base, { deprecated: true, "x-sunset": FUTURE_SUNSET }), base), "/old");
});

test("CT2-4 removing a deprecated optional response field after the date in its x-sunset passes the check", async () => {
  const before = doc(obj({ ...kept, nickname: str({ deprecated: true, "x-sunset": PAST_SUNSET }) }, ["id"]));
  const after = doc(obj(kept, ["id"]));
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated required response field after the date in its x-sunset passes the check", async () => {
  const before = doc(obj({ ...kept, nickname: str({ deprecated: true, "x-sunset": PAST_SUNSET }) }, ["id", "nickname"]));
  const after = doc(obj(kept, ["id"]));
  expectPasses(await check(before, after));
});

test("CT2-4 removing a deprecated operation after the date in its x-sunset passes the check", async () => {
  const base = doc(obj(kept, ["id"]));
  expectPasses(await check(withOldOperation(base, { deprecated: true, "x-sunset": PAST_SUNSET }), base));
});
