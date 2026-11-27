// Shared fixtures for the CT2 tests of the breaking-change rules of EPIC-11 spec 2.8
// (section 2.10, "The breaking-change check"): small OpenAPI 3.1 documents built in memory,
// and a call of checkBreaking on a pair of them in a temporary directory. Not a test file itself.
import { expect } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, makeTempDir, writeJson } from "./CT2-helpers.js";

export { removeTempDirs } from "./CT2-helpers.js";

const breakingPath = path.join(repoRoot, "scripts", "check-breaking.js");
const versionPath = path.join(repoRoot, "scripts", "contract-version.js");

// A date well after today and one well before it, for x-sunset.
export const FUTURE_SUNSET = "2099-12-31";
export const PAST_SUNSET = "2020-01-01";

export const obj = (properties, required = []) => ({ type: "object", properties, required });
export const str = (extra = {}) => ({ type: "string", ...extra });

// A contract whose GET /trips returns `schema` with status 200. `components` are its component
// schemas; `headers` the headers of that 200 response; `paths` more path items.
export function doc(schema, { components = {}, headers = null, paths = {} } = {}) {
  const ok = { description: "OK", content: { "application/json": { schema } } };
  if (headers) ok.headers = headers;
  return {
    openapi: "3.1.0",
    info: { title: "TripMate API", version: "0.0.0" },
    paths: {
      "/trips": { get: { operationId: "list_trips", summary: "The trips", responses: { 200: ok } } },
      ...paths,
    },
    components: { schemas: components },
  };
}

// The same contract with one more operation, GET /old, with `fields` added to the operation
// (for example { deprecated: true, "x-sunset": FUTURE_SUNSET }).
export function withOldOperation(base, fields = {}) {
  const d = structuredClone(base);
  d.paths["/old"] = {
    get: { operationId: "get_old", summary: "An old operation", ...fields, responses: { 200: { description: "OK" } } },
  };
  return d;
}

// Runs checkBreaking with `after` as the new openapi.json and `before` as the openapi.json at
// the release tag contracts-v0.1.0. Returns { ok, problems }.
export async function check(before, after) {
  const mod = await import(pathToFileURL(breakingPath).href);
  expect(typeof mod.checkBreaking).toBe("function");
  const dir = makeTempDir("ct2-rules-");
  const releaseFile = writeJson(dir, "release.json", before);
  const newFile = writeJson(dir, "openapi.json", after);
  const result = await mod.checkBreaking(newFile, [{ tag: "contracts-v0.1.0", file: releaseFile }]);
  expect(typeof result?.ok).toBe("boolean");
  expect(Array.isArray(result?.problems)).toBe(true);
  return result;
}

// The check passes: ok, and no problem. The problems are in the failure message.
export function expectPasses(result) {
  expect(result.problems.map((p) => `${p.tag}: ${p.message}`)).toEqual([]);
  expect(result.ok).toBe(true);
}

// The check fails, with a problem against contracts-v0.1.0 whose message names `name`.
export function expectFails(result, name) {
  expect(result.ok).toBe(false);
  expect(
    result.problems.some((p) => p.tag === "contracts-v0.1.0" && String(p.message).includes(name)),
    `a problem naming ${name}, got: ${JSON.stringify(result.problems)}`,
  ).toBe(true);
}

export async function loadNextTag() {
  const mod = await import(pathToFileURL(versionPath).href);
  expect(typeof mod.nextTag).toBe("function");
  return mod.nextTag;
}
