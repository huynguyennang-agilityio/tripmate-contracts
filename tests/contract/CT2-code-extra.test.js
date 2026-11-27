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

function makeRepo() {
  const repo = makeTempDir("ct2-version-repo-");
  const git = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  const commit = (name, value, message) => {
    writeJson(repo, name, value);
    git("add", "-A");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const run = () => spawnSync(process.execPath, [path.join(repoRoot, "scripts", "contract-version.js")], { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  return { git, commit, run };
}

test("with no tag yet, only the merge itself counts (its first parent is the base); a root commit counts whole", () => {
  const { git, commit, run } = makeRepo();
  commit("openapi.json", makeContract(), "root");
  expect(run().stdout.trim()).toBe("contracts-v0.1.0"); // a root commit: the empty tree is the base
  commit("notes.json", {}, "CI, scripts, docs only");
  expect(run().stdout.trim()).toBe(""); // openapi.json is older than the merge: no tag
  commit("openapi.json", makeContract({ extraPath: "/trips" }), "the next openapi.json");
  expect(run().stdout.trim()).toBe("contracts-v0.1.0");
  expect(git("tag", "--list")).toBe("");
});

test("once a tag exists, changes count since the tag; HEAD inside the last tag gets no tag", () => {
  const { git, commit, run } = makeRepo();
  commit("openapi.json", makeContract(), "first");
  git("tag", "contracts-v0.1.0");
  const older = commit("notes.json", {}, "readme only");
  expect(run().stdout.trim()).toBe(""); // nothing tagged changed since the tag
  const newer = commit("openapi.json", makeContract({ extraPath: "/trips" }), "adds an operation");
  expect(run().stdout.trim()).toBe("contracts-v0.2.0");
  git("tag", "contracts-v0.2.0");
  // The run of an older merge comes late: HEAD is inside the last tag, so no tag, never a higher one.
  for (const rev of [older, newer, "contracts-v0.1.0"]) {
    git("checkout", "-q", "--detach", rev);
    expect(run().stdout.trim()).toBe("");
    expect(run().status).toBe(0);
  }
});
