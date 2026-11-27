// CT2 Draft and release tags: case CT2-9, the first tag of a repository whose contract
// reached main before the tag pipeline. The interface is in tests/INTERFACE.md,
// section "CT2 The command and the first tag".
import { test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { repoRoot, makeContract, makeTempDir, removeTempDirs, writeJson } from "./CT2-helpers.js";

afterEach(removeTempDirs);

function makeRepo() {
  const repo = makeTempDir("ct2-first-tag-");
  const git = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  const commit = (name, value, message) => {
    writeJson(repo, name, value);
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  const run = () => spawnSync(process.execPath, [path.join(repoRoot, "scripts", "contract-version.js")], { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  return { git, commit, run };
}

test("CT2-9 no tag yet: a merge that changes only scripts or a task file tags the contract already on main", () => {
  const { git, commit, run } = makeRepo();
  commit("openapi.json", makeContract(), "the contract, before the pipeline");
  commit("pipeline-script.json", {}, "the pipeline");
  commit("task-file.json", {}, "a task file");

  const result = run();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("contracts-v0.1.0");
  expect(git("tag", "--list")).toBe("");
});

test("CT2-9 no tag yet: a stub in the contract already on main gives the first draft", () => {
  const { commit, run } = makeRepo();
  commit("openapi.json", makeContract({ stub: true }), "a contract with a stub");
  commit("README.json", {}, "readme only");

  expect(run().stdout.trim()).toBe("contracts-v0.1.0-draft.1");
});

test("CT2-9 no tag yet and no contract file in the repository: no tag", () => {
  const { commit, run, git } = makeRepo();
  commit("README.json", {}, "readme only");
  writeJson(path.join(git("rev-parse", "--show-toplevel")), "openapi.json", makeContract());

  const result = run();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("");
});
