// CT2 Draft and release tags: cases CT2-4, CT2-5, and CT2-6, the breaking-change check with
// oasdiff. The interface these tests rely on is in tests/INTERFACE.md.
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, makeContract, makeTempDir, removeTempDirs, writeJson } from "./CT2-helpers.js";

const scriptPath = path.join(repoRoot, "scripts", "check-breaking.js");

afterEach(removeTempDirs);

// Imported inside each test, so a missing module fails that test only.
async function loadModule() {
  const mod = await import(pathToFileURL(scriptPath).href);
  expect(typeof mod.checkBreaking).toBe("function");
  expect(typeof mod.referenceTags).toBe("function");
  return mod;
}

async function check(checkBreaking, file, references) {
  const result = await checkBreaking(file, references);
  expect(typeof result?.ok).toBe("boolean");
  expect(Array.isArray(result?.problems)).toBe(true);
  return result;
}

const released = () =>
  makeContract({ me: { id: { type: "string", required: true }, name: { type: "string", required: true } } });

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

test("CT2-4 a change that removes a field, against the last release tag, fails the breaking-change check", async () => {
  const { checkBreaking, referenceTags } = await loadModule();

  // The last release is the reference; an older release is not.
  expect(referenceTags(["contracts-v0.1.0", "contracts-v0.2.0", "contracts-v0.2.0-draft.1"])).toEqual(["contracts-v0.2.0"]);

  const dir = makeTempDir("ct2-breaking-");
  const releaseFile = writeJson(dir, "release.json", released());
  const newFile = writeJson(dir, "openapi.json", makeContract()); // the required field `name` of Me is removed
  const result = await check(checkBreaking, newFile, [{ tag: "contracts-v0.2.0", file: releaseFile }]);
  expect(result.ok).toBe(false);
  expect(result.problems.length).toBeGreaterThan(0);
  expect(result.problems.every((p) => p.tag === "contracts-v0.2.0")).toBe(true);
  expect(result.problems.some((p) => String(p.message).includes("name"))).toBe(true);

  // The command, in a git repository whose last release tag has the field.
  const repo = makeTempDir("ct2-breaking-repo-");
  git(repo, "init", "-q");
  writeJson(repo, "openapi.json", released());
  git(repo, "add", "openapi.json");
  git(repo, "commit", "-q", "-m", "release");
  git(repo, "tag", "contracts-v0.1.0");
  writeJson(repo, "openapi.json", makeContract());
  const run = spawnSync(process.execPath, [scriptPath], { cwd: repo, encoding: "utf8" });
  expect(run.status).not.toBe(0);
  expect(run.status).not.toBeNull();
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  expect(output).toContain("contracts-v0.1.0");
  expect(output).toContain("name");
});

test("CT2-5 a change that breaks the latest draft fails the check", async () => {
  const { checkBreaking, referenceTags } = await loadModule();

  // A draft newer than the last release is a reference too; a draft older than it is not.
  expect(new Set(referenceTags(["contracts-v0.1.0", "contracts-v0.2.0-draft.1", "contracts-v0.2.0-draft.2"]))).toEqual(
    new Set(["contracts-v0.1.0", "contracts-v0.2.0-draft.2"]),
  );
  expect(referenceTags(["contracts-v0.1.0-draft.1", "contracts-v0.1.0"])).toEqual(["contracts-v0.1.0"]);

  // The draft added the required field `nickname`; the new contract drops it again. Against
  // the release nothing breaks, against the draft it does.
  const dir = makeTempDir("ct2-breaking-");
  const releaseFile = writeJson(dir, "release.json", makeContract());
  const draftFile = writeJson(
    dir,
    "draft.json",
    makeContract({ stub: true, me: { id: { type: "string", required: true }, nickname: { type: "string", required: true } } }),
  );
  const newFile = writeJson(dir, "openapi.json", makeContract({ stub: true }));
  const result = await check(checkBreaking, newFile, [
    { tag: "contracts-v0.1.0", file: releaseFile },
    { tag: "contracts-v0.2.0-draft.2", file: draftFile },
  ]);
  expect(result.ok).toBe(false);
  expect(result.problems.length).toBeGreaterThan(0);
  expect(result.problems.every((p) => p.tag === "contracts-v0.2.0-draft.2")).toBe(true);
  expect(result.problems.some((p) => String(p.message).includes("nickname"))).toBe(true);
});

test("CT2-6 a change that only adds an optional field passes the check", async () => {
  const { checkBreaking, referenceTags } = await loadModule();

  const dir = makeTempDir("ct2-breaking-");
  const releaseFile = writeJson(dir, "release.json", released());
  const newFile = writeJson(
    dir,
    "openapi.json",
    makeContract({
      me: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
        nickname: { type: "string", required: false },
      },
    }),
  );
  const result = await check(checkBreaking, newFile, [{ tag: "contracts-v0.1.0", file: releaseFile }]);
  expect(result).toMatchObject({ ok: true, problems: [] });

  // With no tag yet there is nothing to compare, and the check passes.
  expect(referenceTags([])).toEqual([]);
  expect(await check(checkBreaking, newFile, [])).toMatchObject({ ok: true, problems: [] });
});
