// The breaking-change check (EPIC-11 spec, section 2.10): `oasdiff breaking` of the new
// openapi.json against the last release tag and the latest draft newer than it. Only findings
// at level error count; a warning or an info does not fail the check. No tag yet: it passes.
//
//   node scripts/check-breaking.js [file]    # file defaults to openapi.json
//
// Run in the git repository. The oasdiff binary is $OASDIFF, else `oasdiff` on PATH.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { lastRelease, latestDraft, parseTag } from "./contract-version.js";

const TAG_PREFIX = "contracts-v";
// oasdiff's severity levels in its JSON output: 1 info, 2 warning, 3 error.
const ERROR_LEVELS = new Set([3, "error", "ERR"]);

// The tags to compare with: the last release, and the latest draft when it is newer than that
// release (a draft of the same version as the release is older); [] when there is no tag.
export function referenceTags(tags) {
  const release = lastRelease(tags);
  const draft = latestDraft(tags);
  const picked = [];
  if (release) picked.push(release);
  if (draft && (!release || compareVersion(draft, release) > 0)) picked.push(draft);
  return picked.map((t) => t.name);
}

function compareVersion(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function oasdiffBinary() {
  return process.env.OASDIFF || "oasdiff";
}

function runOasdiff(command, reference, file) {
  const run = spawnSync(
    oasdiffBinary(),
    [command, path.resolve(reference.file), path.resolve(file), "--format", "json", "--allow-external-refs=false"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  const fail = (message) => ({ error: { tag: reference.tag, message } });
  if (run.error) return fail(`cannot run oasdiff (${oasdiffBinary()}): ${run.error.message}`);
  if (run.status !== 0) return fail(`oasdiff exited with ${run.status}: ${(run.stderr || run.stdout).trim()}`);
  let findings;
  try {
    findings = JSON.parse(run.stdout || "[]");
  } catch {
    return fail(`oasdiff printed no JSON: ${run.stdout.trim().slice(0, 500)}`);
  }
  if (!Array.isArray(findings)) return fail("oasdiff printed JSON that is not a list of findings");
  return { findings };
}

// Removing any response property breaks a client that reads it, an optional one too, although
// oasdiff rates the removal of an optional property below error (product owner's decision).
const REMOVED_RESPONSE_PROPERTY = /^response-.*property-removed$/;

function compare(reference, file) {
  // `breaking` lists the error and warning findings; `changelog` also lists the info ones, where
  // the removal of an optional response property is.
  const breaking = runOasdiff("breaking", reference, file);
  if (breaking.error) return [breaking.error];
  const changelog = runOasdiff("changelog", reference, file);
  if (changelog.error) return [changelog.error];
  const seen = new Set();
  const problems = [];
  for (const f of [...breaking.findings, ...changelog.findings]) {
    if (!ERROR_LEVELS.has(f.level) && !REMOVED_RESPONSE_PROPERTY.test(f.id ?? "")) continue;
    const message = [f.text, f.operation && f.path ? `(${f.operation} ${f.path})` : f.path ? `(${f.path})` : ""].filter(Boolean).join(" ");
    if (seen.has(message)) continue;
    seen.add(message);
    problems.push({ tag: reference.tag, message });
  }
  return problems;
}

// references: [{ tag, file }]; returns { ok, problems: [{ tag, message }] }.
export function checkBreaking(file, references) {
  const problems = references.flatMap((reference) => compare(reference, file));
  return { ok: problems.length === 0, problems };
}

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function main(argv) {
  const file = argv[0] ?? "openapi.json";
  const tags = git("tag", "--list", `${TAG_PREFIX}*`).split("\n").filter((t) => parseTag(t));
  const picked = referenceTags(tags);
  if (picked.length === 0) {
    console.log("No contract tag yet: nothing to compare with.");
    return 0;
  }
  const dir = mkdtempSync(path.join(tmpdir(), "check-breaking-"));
  try {
    const references = picked.map((tag) => {
      const copy = path.join(dir, `${tag}.json`);
      writeFileSync(copy, git("show", `${tag}:openapi.json`));
      return { tag, file: copy };
    });
    const { ok, problems } = checkBreaking(file, references);
    if (ok) {
      console.log(`No breaking change against ${picked.join(", ")}.`);
      return 0;
    }
    for (const p of problems) console.error(`${p.tag}\t${p.message}`);
    console.error(`${problems.length} breaking change(s) in ${file}`);
    return 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
