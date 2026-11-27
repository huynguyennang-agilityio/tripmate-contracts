// CT2 Draft and release tags: case CT2-4, how the check reads x-sunset (EPIC-11 spec 2.8,
// section 2.10, "The breaking-change check"), with the lead's decisions on what the spec leaves
// open (test-check, round 3):
// C1: "today" is the UTC date for every kind of removal, also those oasdiff rates itself, whatever
//     the TZ of the process; an x-sunset of today (UTC) is reached, one of tomorrow (UTC) is not.
// C2: x-sunset is read as oasdiff reads it: an RFC 3339 date (YYYY-MM-DD) or date-time
//     (2020-01-01T00:00:00Z); a past one passes for every kind; an invalid date (2020-13-45) or any
//     other malformed value fails for every kind.
// and (test-check, round 4):
// P2: a date-time counts by the UTC date of its instant, for every kind.
// P3/P4: a value oasdiff or RFC 3339 refuses (a leap second, the offset +24:00, :60 seconds at a
//     minute other than 23:59) is not reached, for every kind; a lowercase t or z is valid.
// It also holds the rows of the breaking-change table of spec 2.8 that had no test of their own
// (test-check, round 3, T1), at the end.
// The interface is in tests/INTERFACE.md.
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
import { checkInZone, utcDate, withCreate } from "./CT2-gap-helpers.js";

afterEach(removeTempDirs);

const kept = { id: str() };
const base = doc(obj(kept, ["id"]));

// Each kind of removal of a deprecated item with `x-sunset`: { before, after, name }.
const kinds = {
  "an optional response field": (sunset) => ({
    before: doc(obj({ ...kept, nickname: str({ deprecated: true, "x-sunset": sunset }) }, ["id"])),
    after: base,
    name: "nickname",
  }),
  "a required response field": (sunset) => ({
    before: doc(obj({ ...kept, nickname: str({ deprecated: true, "x-sunset": sunset }) }, ["id", "nickname"])),
    after: base,
    name: "nickname",
  }),
  "an operation": (sunset) => ({
    before: withOldOperation(base, { deprecated: true, "x-sunset": sunset }),
    after: base,
    name: "/old",
  }),
  "a response header": (sunset) => ({
    before: doc(obj(kept, ["id"]), {
      headers: { "X-Total-Count": { deprecated: true, "x-sunset": sunset, schema: { type: "integer" } } },
    }),
    after: base,
    name: "X-Total-Count",
  }),
  "a required response header": (sunset) => ({
    before: doc(obj(kept, ["id"]), {
      headers: { "X-Total-Count": { required: true, deprecated: true, "x-sunset": sunset, schema: { type: "integer" } } },
    }),
    after: base,
    name: "X-Total-Count",
  }),
};

// C1. Pacific/Pago_Pago is UTC-11 (its date is yesterday's before 11:00 UTC); Pacific/Kiritimati
// is UTC+14 (its date is tomorrow's from 10:00 UTC). Together they cover every hour of the day.
for (const [kind, make] of Object.entries(kinds)) {
  for (const zone of ["Pacific/Pago_Pago", "Pacific/Kiritimati"]) {
    test(`CT2-4 C1 with TZ=${zone}, removing ${kind} whose x-sunset is today (UTC) passes the check`, () => {
      const { before, after } = make(utcDate(0));
      expectPasses(checkInZone(zone, before, after));
    });

    test(`CT2-4 C1 with TZ=${zone}, removing ${kind} whose x-sunset is tomorrow (UTC) fails the check`, () => {
      const { before, after, name } = make(utcDate(1));
      expectFails(checkInZone(zone, before, after), name);
    });
  }
}

// C2.
for (const [kind, make] of Object.entries(kinds)) {
  test(`CT2-4 C2 removing ${kind} whose x-sunset is a past RFC 3339 date-time passes the check`, async () => {
    const { before, after } = make("2020-01-01T00:00:00Z");
    expectPasses(await check(before, after));
  });

  for (const sunset of ["2020-13-45", "2020-02-30", "2020-1-1", "soon", ""]) {
    test(`CT2-4 C2 removing ${kind} whose x-sunset is the malformed ${JSON.stringify(sunset)} fails the check`, async () => {
      const { before, after, name } = make(sunset);
      expectFails(await check(before, after), name);
    });
  }
}

// P2. Waits until UTC midnight has passed when it is less than 90 seconds away, so that "today"
// is the same date for the test and for the check it runs.
async function awayFromUtcMidnight() {
  const now = Date.now();
  const untilMidnight = 86_400_000 - (now % 86_400_000);
  if (untilMidnight < 90_000) await new Promise((resolve) => setTimeout(resolve, untilMidnight + 1_000));
}

for (const [kind, make] of Object.entries(kinds)) {
  test(`CT2-4 P2 removing ${kind} whose x-sunset is today 23:30 at -05:00 (tomorrow in UTC) fails the check`, async () => {
    await awayFromUtcMidnight();
    const { before, after, name } = make(`${utcDate(0)}T23:30:00-05:00`);
    expectFails(await check(before, after), name);
  }, 120_000);

  test(`CT2-4 P2 removing ${kind} whose x-sunset is tomorrow 01:00 at +05:00 (today in UTC) passes the check`, async () => {
    await awayFromUtcMidnight();
    const { before, after } = make(`${utcDate(1)}T01:00:00+05:00`);
    expectPasses(await check(before, after));
  }, 120_000);
}

// P3/P4.
for (const [kind, make] of Object.entries(kinds)) {
  for (const sunset of ["2016-12-31T23:59:60Z", "2020-01-01T00:00:00+24:00", "2020-01-01T12:00:60Z"]) {
    test(`CT2-4 P3 removing ${kind} whose x-sunset is the refused ${sunset} fails the check`, async () => {
      const { before, after, name } = make(sunset);
      expectFails(await check(before, after), name);
    });
  }

  test(`CT2-4 P4 removing ${kind} whose x-sunset is the past 2020-01-01t00:00:00z (lowercase t and z) passes the check`, async () => {
    const { before, after } = make("2020-01-01t00:00:00z");
    expectPasses(await check(before, after));
  });
}

// T1, the rows of the breaking-change table (spec 2.8) that had no test of their own.
const body = obj({ id: str() }, ["id"]);
const plain = doc(body);

test("CT2-4 removing an operation that is not deprecated fails the check and names its path", async () => {
  expectFails(await check(withOldOperation(plain), plain), "/old");
});

test("CT2-4 widening a response type (integer to number) fails the check", async () => {
  const before = doc(obj({ id: str(), price: { type: "integer" } }, ["id", "price"]));
  const after = doc(obj({ id: str(), price: { type: "number" } }, ["id", "price"]));
  expectFails(await check(before, after), "price");
});

test("CT2-4 narrowing a request type (number to integer) fails the check", async () => {
  const before = withCreate(plain, obj({ seats: { type: "number" } }));
  const after = withCreate(plain, obj({ seats: { type: "integer" } }));
  expectFails(await check(before, after), "seats");
});

test("CT2-4 making a request field required fails the check", async () => {
  const before = withCreate(plain, obj({ name: str(), note: str() }, ["name"]));
  const after = withCreate(plain, obj({ name: str(), note: str() }, ["name", "note"]));
  expectFails(await check(before, after), "note");
});

test("CT2-4 narrowing a response type (number to integer) passes the check", async () => {
  const before = doc(obj({ id: str(), price: { type: "number" } }, ["id", "price"]));
  const after = doc(obj({ id: str(), price: { type: "integer" } }, ["id", "price"]));
  expectPasses(await check(before, after));
});

test("CT2-4 widening a request type (integer to number) passes the check", async () => {
  const before = withCreate(plain, obj({ seats: { type: "integer" } }));
  const after = withCreate(plain, obj({ seats: { type: "number" } }));
  expectPasses(await check(before, after));
});

test("CT2-4 removing an optional request field passes the check", async () => {
  const before = withCreate(plain, obj({ name: str(), note: str() }, ["name"]));
  const after = withCreate(plain, obj({ name: str() }, ["name"]));
  expectPasses(await check(before, after));
});

test("CT2-4 removing a required request field passes the check", async () => {
  const before = withCreate(plain, obj({ name: str(), note: str() }, ["name", "note"]));
  const after = withCreate(plain, obj({ name: str() }, ["name"]));
  expectPasses(await check(before, after));
});

test("CT2-4 removing a required response header fails the check and names the header", async () => {
  const before = doc(body, { headers: { "X-Total-Count": { required: true, schema: { type: "integer" } } } });
  expectFails(await check(before, plain), "X-Total-Count");
});

test("CT2-4 removing a deprecated response header before the date in its x-sunset fails the check", async () => {
  const header = { deprecated: true, "x-sunset": FUTURE_SUNSET, schema: { type: "integer" } };
  const before = doc(body, { headers: { "X-Total-Count": header } });
  expectFails(await check(before, plain), "X-Total-Count");
});

test("CT2-4 removing a deprecated response header after the date in its x-sunset passes the check", async () => {
  const header = { deprecated: true, "x-sunset": PAST_SUNSET, schema: { type: "integer" } };
  const before = doc(body, { headers: { "X-Total-Count": header } });
  expectPasses(await check(before, plain));
});
