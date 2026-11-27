// CT2 Draft and release tags: case CT2-4, a contract that did not change (EPIC-11 spec 2.8,
// section 2.10, "The breaking-change check"), with the lead's decision of the test-check,
// round 5 (R1): a contract item that did not change never fails because of its x-sunset.
// The reference (contracts-v0.1.0) and the new openapi.json are the same document, holding a
// deprecated item whose x-sunset has one of the forms below; nothing is removed, so the check
// passes, whatever the form (one the date rule reads as not reached, or refuses, included).
// The interface is in tests/INTERFACE.md.
import { test, afterEach } from "vitest";
import { check, doc, expectPasses, obj, removeTempDirs, str, withOldOperation } from "./CT2-rules-helpers.js";
import { utcDate } from "./CT2-gap-helpers.js";

afterEach(removeTempDirs);

const kept = { id: str() };
const base = doc(obj(kept, ["id"]));

// Each kind of deprecated item, in a contract built around it.
const kinds = {
  "an operation": (sunset) => withOldOperation(base, { deprecated: true, "x-sunset": sunset }),
  "a query parameter": (sunset) => {
    const d = structuredClone(base);
    d.paths["/trips"].get.parameters = [
      { name: "q", in: "query", deprecated: true, "x-sunset": sunset, schema: { type: "string" } },
    ];
    return d;
  },
  "an optional response property": (sunset) =>
    doc(obj({ ...kept, nickname: str({ deprecated: true, "x-sunset": sunset }) }, ["id"])),
  "a required response property": (sunset) =>
    doc(obj({ ...kept, nickname: str({ deprecated: true, "x-sunset": sunset }) }, ["id", "nickname"])),
  "a response header": (sunset) =>
    doc(obj(kept, ["id"]), {
      headers: { "X-Total-Count": { deprecated: true, "x-sunset": sunset, schema: { type: "integer" } } },
    }),
};

// The forms of x-sunset; each is a function, so that D (today's UTC date) is computed when the
// test runs.
const forms = {
  "today 23:30 at -05:00 (tomorrow in UTC)": () => `${utcDate(0)}T23:30:00-05:00`,
  "the leap second 2016-12-31T23:59:60Z": () => "2016-12-31T23:59:60Z",
  "the lowercase 2030-01-01t00:00:00z": () => "2030-01-01t00:00:00z",
  "the malformed 2099-1-1": () => "2099-1-1",
  "a number": () => 20991231,
  "a boolean": () => true,
  "the date to come 2099-12-31": () => "2099-12-31",
};

// Waits until UTC midnight has passed when it is less than 90 seconds away, so that "today" is
// the same date for the test and for the check it runs.
async function awayFromUtcMidnight() {
  const untilMidnight = 86_400_000 - (Date.now() % 86_400_000);
  if (untilMidnight < 90_000) await new Promise((resolve) => setTimeout(resolve, untilMidnight + 1_000));
}

for (const [kind, make] of Object.entries(kinds)) {
  for (const [form, sunset] of Object.entries(forms)) {
    test(`CT2-4 R1 an unchanged contract with ${kind} deprecated, x-sunset ${form}, passes the check`, async () => {
      await awayFromUtcMidnight();
      const contract = make(sunset());
      expectPasses(await check(contract, structuredClone(contract)));
    }, 120_000);
  }
}
