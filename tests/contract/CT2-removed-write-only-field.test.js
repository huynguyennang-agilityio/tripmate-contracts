// CT2 Draft and release tags: case CT2-4, as the product owner decided after the first tests:
// a property marked writeOnly: true is not a response field, so removing it from a schema used
// in a response does not fail the breaking-change check. The interface is in tests/INTERFACE.md.
import { test, expect, afterEach } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, makeContract, makeTempDir, removeTempDirs, writeJson } from "./CT2-helpers.js";

const scriptPath = path.join(repoRoot, "scripts", "check-breaking.js");

afterEach(removeTempDirs);

// The Me response schema with required `id`, optional `nickname`, and, unless left out,
// `password` marked writeOnly: true.
function contractWith({ nickname = true, password = true } = {}) {
  const me = { id: { type: "string", required: true } };
  if (nickname) me.nickname = { type: "string", required: false };
  const contract = makeContract({ me });
  if (password) contract.components.schemas.Me.properties.password = { type: "string", title: "password", writeOnly: true };
  return contract;
}

test("CT2-4 a change that removes only a writeOnly property from a response schema, against the last release tag, passes the breaking-change check", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  expect(typeof mod.checkBreaking).toBe("function");

  const dir = makeTempDir("ct2-breaking-write-only-");
  const releaseFile = writeJson(dir, "release.json", contractWith());
  const references = [{ tag: "contracts-v0.1.0", file: releaseFile }];

  // Only `password` (writeOnly) is removed: nothing breaks.
  const withoutPassword = writeJson(dir, "openapi.json", contractWith({ password: false }));
  expect(await mod.checkBreaking(withoutPassword, references)).toMatchObject({ ok: true, problems: [] });

  // Control: removing `nickname` in the same setup still fails and names it.
  const withoutNickname = writeJson(dir, "openapi-no-nickname.json", contractWith({ nickname: false }));
  const result = await mod.checkBreaking(withoutNickname, references);
  expect(result.ok).toBe(false);
  expect(result.problems.some((p) => p.tag === "contracts-v0.1.0" && String(p.message).includes("nickname"))).toBe(true);
});
