// CT2 Draft and release tags: case CT2-4, as the product owner decided after the first tests:
// removing any response field fails the breaking-change check, an optional one too, although
// oasdiff rates that below error. The interface is in tests/INTERFACE.md.
import { test, expect, afterEach } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, makeContract, makeTempDir, removeTempDirs, writeJson } from "./CT2-helpers.js";

const scriptPath = path.join(repoRoot, "scripts", "check-breaking.js");

afterEach(removeTempDirs);

test("CT2-4 a change that removes an optional response field, against the last release tag, fails the breaking-change check", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  expect(typeof mod.checkBreaking).toBe("function");

  const dir = makeTempDir("ct2-breaking-optional-");
  const releaseFile = writeJson(
    dir,
    "release.json",
    makeContract({ me: { id: { type: "string", required: true }, nickname: { type: "string", required: false } } }),
  );
  const newFile = writeJson(dir, "openapi.json", makeContract()); // the optional field `nickname` of Me is removed
  const result = await mod.checkBreaking(newFile, [{ tag: "contracts-v0.1.0", file: releaseFile }]);
  expect(typeof result?.ok).toBe("boolean");
  expect(Array.isArray(result?.problems)).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.problems.some((p) => p.tag === "contracts-v0.1.0" && String(p.message).includes("nickname"))).toBe(true);
});
