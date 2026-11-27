// CT2 Draft and release tags: cases CT2-3, the version table of EPIC-11 spec 2.10: a release that
// adds a field is the next minor version, wherever the field is added. Lead's decision C5
// (test-check, round 3): also under `$defs` (an entry named `default`), under `dependentSchemas`,
// in a webhook named `example`, under a callback, and in the headers of an `encoding` entry
// named `default`. Lead's decision P5 (test-check, round 4): adding an operation in `webhooks`
// (a new webhook, or a new method on an existing one) or in a callback, even with no fields, is
// also the next minor version. The interface is in tests/INTERFACE.md.
import { test, expect } from "vitest";
import { makeContract } from "./CT2-helpers.js";
import { loadNextTag } from "./CT2-rules-helpers.js";

// The tag after contracts-v0.1.0 when the contract changes from what `place(c, false)` builds to
// what `place(c, true)` builds (true adds the field `detail`).
async function tagAfter(place) {
  const nextTag = await loadNextTag();
  const previousContract = makeContract();
  const contract = makeContract();
  place(previousContract, false);
  place(contract, true);
  return nextTag({ tags: ["contracts-v0.1.0"], changedPaths: ["openapi.json"], contract, previousContract });
}

const schema = (add) => ({
  type: "object",
  properties: { code: { type: "string" }, ...(add ? { detail: { type: "string" } } : {}) },
});
const operation = (add) => ({
  requestBody: { content: { "application/json": { schema: schema(add) } } },
  responses: { 200: { description: "OK" } },
});

const places = {
  "under $defs, in an entry named default": (c, add) => {
    c.components.schemas.Me.$defs = { default: schema(add) };
  },
  "under dependentSchemas": (c, add) => {
    c.components.schemas.Me.dependentSchemas = { id: schema(add) };
  },
  "in a webhook named example": (c, add) => {
    c.webhooks = { example: { post: operation(add) } };
  },
  "under a callback": (c, add) => {
    c.paths["/me"].get.callbacks = { onEvent: { "{$request.query.url}": { post: operation(add) } } };
  },
  "in the headers of an encoding entry named default": (c, add) => {
    c.paths["/me"].post = {
      operationId: "post_me",
      summary: "Update the user",
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: { type: "object", properties: { default: { type: "string" } } },
            encoding: { default: { contentType: "text/plain", headers: { "X-Part": { schema: schema(add) } } } },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    };
  },
};

for (const [where, place] of Object.entries(places)) {
  test(`CT2-3 C5 after contracts-v0.1.0, adding a field ${where} gives contracts-v0.2.0`, async () => {
    expect(await tagAfter(place)).toBe("contracts-v0.2.0");
  });
}

// P5. `place(c, true)` adds an operation with no fields; `place(c, false)` leaves it out.
const bare = { responses: { 200: { description: "OK" } } };
const operations = {
  "a new webhook": (c, add) => {
    if (add) c.webhooks = { tripCreated: { post: bare } };
  },
  "a new method on an existing webhook": (c, add) => {
    c.webhooks = { tripCreated: { post: bare, ...(add ? { put: bare } : {}) } };
  },
  "a new callback": (c, add) => {
    if (add) c.paths["/me"].get.callbacks = { onEvent: { "{$request.query.url}": { post: bare } } };
  },
  "a new method in an existing callback": (c, add) => {
    c.paths["/me"].get.callbacks = { onEvent: { "{$request.query.url}": { post: bare, ...(add ? { put: bare } : {}) } } };
  },
};

for (const [what, place] of Object.entries(operations)) {
  test(`CT2-3 P5 after contracts-v0.1.0, adding an operation with no fields in ${what} gives contracts-v0.2.0`, async () => {
    expect(await tagAfter(place)).toBe("contracts-v0.2.0");
  });
}
