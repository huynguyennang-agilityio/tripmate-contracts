// CT2 Draft and release tags: cases CT2-6 and CT2-4, rows of the breaking-change table in
// EPIC-11 spec 2.8 (section 2.10): adding an enum value to a response field passes (every client
// shows an unknown value as a neutral fallback); removing a response header fails like removing
// a response field, an optional one too, unless it is marked deprecated (with no x-sunset).
// The interface is in tests/INTERFACE.md.
import { test, afterEach } from "vitest";
import { check, doc, expectFails, expectPasses, obj, removeTempDirs, str } from "./CT2-rules-helpers.js";

afterEach(removeTempDirs);

test("CT2-6 adding an enum value to a response field passes the check", async () => {
  const before = doc(obj({ id: str(), status: str({ enum: ["planned", "done"] }) }, ["id", "status"]));
  const after = doc(obj({ id: str(), status: str({ enum: ["planned", "done", "cancelled"] }) }, ["id", "status"]));
  expectPasses(await check(before, after));
});

test("CT2-4 removing an optional response header fails the check and names the header", async () => {
  const body = obj({ id: str() }, ["id"]);
  const before = doc(body, { headers: { "X-Total-Count": { schema: { type: "integer" } } } });
  const after = doc(body);
  expectFails(await check(before, after), "X-Total-Count");
});

test("CT2-4 removing a deprecated optional response header with no x-sunset passes the check", async () => {
  const body = obj({ id: str() }, ["id"]);
  const before = doc(body, { headers: { "X-Total-Count": { deprecated: true, schema: { type: "integer" } } } });
  const after = doc(body);
  expectPasses(await check(before, after));
});
