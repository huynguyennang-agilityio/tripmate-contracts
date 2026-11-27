// Shared fixtures for the CT2 tests added after the test-check of round 3: a contract with a
// request body, and a call of checkBreaking in a child process with its own time zone (TZ).
// Not a test file itself.
import { expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, makeTempDir, writeJson } from "./CT2-helpers.js";

const breakingPath = path.join(repoRoot, "scripts", "check-breaking.js");

// The contract `base` with one more operation, POST /trips, whose request body is `schema`.
export function withCreate(base, schema) {
  const d = structuredClone(base);
  d.paths["/trips"].post = {
    operationId: "create_trip",
    summary: "Create a trip",
    requestBody: { required: true, content: { "application/json": { schema } } },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
      },
    },
  };
  return d;
}

// The UTC date of today plus `days`, as YYYY-MM-DD.
export function utcDate(days = 0) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// Runs checkBreaking like `check` of CT2-rules-helpers.js, in a child Node process whose
// environment has TZ set to `timeZone` (the oasdiff it runs inherits it). Returns { ok, problems }.
export function checkInZone(timeZone, before, after) {
  const dir = makeTempDir("ct2-zone-");
  const releaseFile = writeJson(dir, "release.json", before);
  const newFile = writeJson(dir, "openapi.json", after);
  const code = [
    `const { checkBreaking } = await import(${JSON.stringify(pathToFileURL(breakingPath).href)});`,
    `const r = await checkBreaking(${JSON.stringify(newFile)}, [{ tag: "contracts-v0.1.0", file: ${JSON.stringify(releaseFile)} }]);`,
    `process.stdout.write(JSON.stringify(r));`,
  ].join("\n");
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: repoRoot,
    env: { ...process.env, TZ: timeZone },
    encoding: "utf8",
  });
  expect(run.status, `child process failed: ${run.stderr}`).toBe(0);
  const result = JSON.parse(run.stdout);
  expect(typeof result?.ok).toBe("boolean");
  expect(Array.isArray(result?.problems)).toBe(true);
  return result;
}
