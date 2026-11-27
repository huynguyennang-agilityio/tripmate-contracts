// CT2 Draft and release tags: cases CT2-3 and CT2-7, the version table of EPIC-11 spec 2.10:
// a release that adds a field or an enum value is the next minor version, any other change the
// next patch version. Review round 2, defect 2: `default`, `example`, `examples`, and `const`
// are schema keywords only where a schema has them, not where they are the name of a response,
// a component schema, or a property. The interface is in tests/INTERFACE.md.
import { test, expect } from "vitest";
import { makeContract } from "./CT2-helpers.js";
import { loadNextTag } from "./CT2-rules-helpers.js";

const afterRelease = (nextTag, previousContract, contract) =>
  nextTag({ tags: ["contracts-v0.1.0"], changedPaths: ["openapi.json"], contract, previousContract });

// GET /me with a `default` response whose schema is `schema`.
function withDefaultResponse(schema) {
  const c = makeContract();
  c.paths["/me"].get.responses.default = {
    description: "An error",
    content: { "application/json": { schema } },
  };
  return c;
}

// A contract with the component schema `name`, used by the 404 response of GET /health.
function withComponentNamed(name, schema) {
  const c = makeContract();
  c.components.schemas[name] = schema;
  c.paths["/health"].get.responses[404] = {
    description: "Not found",
    content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } },
  };
  return c;
}

const errorSchema = (properties) => ({ type: "object", title: "Error", properties, required: ["code"] });

test("CT2-3 after contracts-v0.1.0, adding a field under responses.default gives contracts-v0.2.0", async () => {
  const nextTag = await loadNextTag();
  const before = withDefaultResponse(errorSchema({ code: { type: "string" } }));
  const after = withDefaultResponse(errorSchema({ code: { type: "string" }, detail: { type: "string" } }));
  expect(afterRelease(nextTag, before, after)).toBe("contracts-v0.2.0");
});

test("CT2-3 after contracts-v0.1.0, adding an enum value under responses.default gives contracts-v0.2.0", async () => {
  const nextTag = await loadNextTag();
  const before = withDefaultResponse(errorSchema({ code: { type: "string", enum: ["not_found"] } }));
  const after = withDefaultResponse(errorSchema({ code: { type: "string", enum: ["not_found", "gone"] } }));
  expect(afterRelease(nextTag, before, after)).toBe("contracts-v0.2.0");
});

for (const name of ["default", "example"]) {
  test(`CT2-3 after contracts-v0.1.0, adding a field to a component schema named ${name} gives contracts-v0.2.0`, async () => {
    const nextTag = await loadNextTag();
    const before = withComponentNamed(name, errorSchema({ code: { type: "string" } }));
    const after = withComponentNamed(name, errorSchema({ code: { type: "string" }, detail: { type: "string" } }));
    expect(afterRelease(nextTag, before, after)).toBe("contracts-v0.2.0");
  });

  test(`CT2-3 after contracts-v0.1.0, adding an enum value in a component schema named ${name} gives contracts-v0.2.0`, async () => {
    const nextTag = await loadNextTag();
    const before = withComponentNamed(name, errorSchema({ code: { type: "string", enum: ["not_found"] } }));
    const after = withComponentNamed(name, errorSchema({ code: { type: "string", enum: ["not_found", "gone"] } }));
    expect(afterRelease(nextTag, before, after)).toBe("contracts-v0.2.0");
  });
}

test("CT2-7 after contracts-v0.1.0, adding only a description to a property named properties gives contracts-v0.1.1", async () => {
  const nextTag = await loadNextTag();
  const property = { type: "object", title: "properties", properties: { city: { type: "string" } } };
  const before = makeContract();
  before.components.schemas.Me.properties.properties = structuredClone(property);
  const after = makeContract();
  after.components.schemas.Me.properties.properties = { ...structuredClone(property), description: "The user's settings" };
  expect(afterRelease(nextTag, before, after)).toBe("contracts-v0.1.1");
});
