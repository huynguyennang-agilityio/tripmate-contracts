// CT2 tests written by the code agent, for what the test agent's cases leave open:
// what counts as an addition, tags to ignore, and the command's tag output.
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, makeContract, makeTempDir, removeTempDirs, writeJson } from "./CT2-helpers.js";

afterEach(removeTempDirs);

const load = (name) => import(pathToFileURL(path.join(repoRoot, "scripts", name)).href);

test("a release that adds an enum value, a field, or an operation is a minor version", async () => {
  const { nextTag } = await load("contract-version.js");
  const tags = ["contracts-v1.3.0"];
  const previous = makeContract();
  const withEnum = makeContract();
  withEnum.components.schemas.Health.properties.status.enum = ["ok"];
  const previousEnum = structuredClone(withEnum);
  const moreEnum = structuredClone(withEnum);
  moreEnum.components.schemas.Health.properties.status.enum.push("degraded");
  const run = (contract, prev) => nextTag({ tags, changedPaths: ["openapi.json"], contract, previousContract: prev });

  expect(run(makeContract({ extraPath: "/trips" }), previous)).toBe("contracts-v1.4.0");
  expect(run(makeContract({ me: { id: { type: "string", required: true }, nick: { type: "string", required: false } } }), previous)).toBe("contracts-v1.4.0");
  expect(run(moreEnum, previousEnum)).toBe("contracts-v1.4.0");
  expect(run(makeContract(), previous)).toBe("contracts-v1.3.1");
  expect(nextTag({ tags, changedPaths: ["events.schema.json"], contract: makeContract(), previousContract: previous })).toBe("contracts-v1.4.0");
});

test("a tag that is not a contract tag is ignored, and a draft before its release does not count", async () => {
  const { nextTag } = await load("contract-version.js");
  const { referenceTags } = await load("check-breaking.js");
  const changedPaths = ["translations/en/auth.json"];
  expect(nextTag({ tags: ["v9.9.9", "web-v2.0.0", "contracts-v0.1.0-draft.1", "contracts-v0.1.0"], changedPaths, contract: makeContract(), previousContract: makeContract() })).toBe("contracts-v0.1.1");
  expect(referenceTags(["v9.9.9", "contracts-v0.1.0-draft.2", "contracts-v0.1.0"])).toEqual(["contracts-v0.1.0"]);
  expect(referenceTags(["contracts-v0.1.0-draft.1", "contracts-v0.1.0-draft.2"])).toEqual(["contracts-v0.1.0-draft.2"]);
  expect(referenceTags([])).toEqual([]);
});

test("the command prints the next tag from the last tag's commit, and nothing when no file counts", async () => {
  const repo = makeTempDir("ct2-version-repo-");
  const git = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  const script = path.join(repoRoot, "scripts", "contract-version.js");
  const run = () => spawnSync(process.execPath, [script], { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  writeJson(repo, "openapi.json", makeContract());
  git("add", "-A");
  git("commit", "-q", "-m", "first");
  expect(run().stdout.trim()).toBe("contracts-v0.1.0");
  git("tag", "contracts-v0.1.0");
  writeJson(repo, "notes.json", {});
  git("add", "-A");
  git("commit", "-q", "-m", "readme only");
  expect(run().stdout.trim()).toBe("");
  expect(run().status).toBe(0);
});
