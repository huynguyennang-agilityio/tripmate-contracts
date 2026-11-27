// The breaking-change check (EPIC-11 spec, section 2.10, table "The breaking-change check"):
// `oasdiff breaking` of the new openapi.json against the last release tag and the latest draft
// newer than it, with the spec's rules on top of oasdiff's: oasdiff's error findings fail it, so
// do a removed optional response property or header, and a removal of something marked
// `deprecated` before its `x-sunset` date; an added enum value in a response is ignored, and so
// is a removal of something deprecated whose `x-sunset` is absent, today, or past. A warning or
// an info finding fails only where this file says so. No tag yet: it passes.
//
//   node scripts/check-breaking.js [file]    # file defaults to openapi.json
//
// Run in the git repository. The oasdiff binary is $OASDIFF, else `oasdiff` on PATH.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// Removing an optional response property or header breaks a client that reads it, although
// oasdiff rates it info (product owner's decision). Not matched on purpose: the `write-only` ids (a
// writeOnly property is no response field) and every other `response-...-property-removed` id.
const REMOVED_OPTIONAL_RESPONSE_PROPERTY = "response-optional-property-removed";
const REMOVED_RESPONSE_HEADER = new Set(["optional-response-header-removed", "required-response-header-removed"]);
// A removed required property or path is reported by oasdiff as `...-removed-before-sunset` (an
// error) or `...-with-deprecation` (info) already; these ids are not touched here.

// An added enum value in a response is not breaking (every client shows an unknown value as a
// neutral fallback), although oasdiff rates it an error.
const IGNORED_IDS = new Set(["response-property-enum-value-added", "response-mediatype-enum-value-added"]);

function resolveRef(doc, node) {
  let current = node;
  for (let hops = 0; current && typeof current === "object" && typeof current.$ref === "string" && hops < 20; hops++) {
    if (!current.$ref.startsWith("#/")) return undefined;
    current = current.$ref.slice(2).split("/").reduce((n, key) => n?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
  }
  return current;
}

// A removal is allowed when the node is marked `deprecated: true` and its `x-sunset` (YYYY-MM-DD) is
// absent, today, or past. A `$ref` node is read before the ref is resolved (OpenAPI 3.1 allows
// `deprecated` beside `$ref`), then the target. An unreadable date is not past.
function removalAllowed(doc, node, today = new Date().toISOString().slice(0, 10)) {
  const own = node && typeof node === "object" ? node : {};
  const target = resolveRef(doc, node) ?? {};
  const deprecated = own.deprecated === true || target.deprecated === true;
  if (!deprecated) return false;
  const sunset = own["x-sunset"] ?? target["x-sunset"];
  if (sunset === undefined || sunset === null) return true;
  return typeof sunset === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sunset) && sunset <= today;
}

// The schema nodes that `path` (oasdiff's name of a property: segments joined by `/`, with `items`,
// `allOf[subschema #N]`, `oneOf[...]`, `anyOf[...]`; a property name may contain `/` itself) can
// name below `schema`. A node is returned as written (a `$ref` node is not resolved).
function schemaNodes(doc, schema, path, depth = 0) {
  if (path === "") return [schema];
  const resolved = resolveRef(doc, schema);
  if (!resolved || typeof resolved !== "object" || depth > 50) return [];
  const found = [];
  const step = (prefix, next) => {
    if (next !== undefined && path.startsWith(prefix)) found.push(...schemaNodes(doc, next, path.slice(prefix.length), depth + 1));
  };
  step("items/", resolved.items);
  for (const kind of ["allOf", "oneOf", "anyOf"]) {
    (resolved[kind] ?? []).forEach?.((sub, i) => step(`${kind}[subschema #${i + 1}]/`, sub));
  }
  for (const [name, property] of Object.entries(resolved.properties ?? {})) {
    if (path === name) found.push(property);
    else step(`${name}/`, property);
  }
  return found;
}

function operationOf(doc, finding) {
  return doc?.paths?.[finding.path]?.[String(finding.operation ?? "").toLowerCase()];
}

// True when the property that `finding` says was removed is marked deprecated in `doc` (the
// reference document), and its x-sunset allows the removal. Anything that cannot be found is not
// deprecated.
function propertyRemovalAllowed(doc, finding) {
  const named = /property `([^`]+)`.*response with the `([^`]+)` status/.exec(finding.text ?? "");
  const operation = operationOf(doc, finding);
  if (!named || !operation) return false;
  const response = resolveRef(doc, operation.responses?.[named[2]]);
  for (const media of Object.values(response?.content ?? {})) {
    if (schemaNodes(doc, media?.schema, named[1]).some((node) => removalAllowed(doc, node))) return true;
  }
  return false;
}

// The removed header of `finding`: { name (as the reference writes it), allowed }. oasdiff
// lowercases the name; header names are case-insensitive.
function removedHeader(doc, finding) {
  const named = /header `([^`]+)` removed for the status `([^`]+)`/.exec(finding.text ?? "");
  if (!named) return null;
  const response = resolveRef(doc, operationOf(doc, finding)?.responses?.[named[2]]);
  const original = Object.keys(response?.headers ?? {}).find((n) => n.toLowerCase() === named[1].toLowerCase());
  if (original === undefined) return { name: named[1], allowed: false };
  return { name: original, allowed: removalAllowed(doc, response.headers[original]) };
}

function compare(reference, file) {
  // `breaking` lists the error and warning findings; `changelog` also lists the info ones, where
  // the removal of an optional response property is.
  const breaking = runOasdiff("breaking", reference, file);
  if (breaking.error) return [breaking.error];
  const changelog = runOasdiff("changelog", reference, file);
  if (changelog.error) return [changelog.error];
  let referenceDoc = null;
  try {
    referenceDoc = JSON.parse(readFileSync(reference.file, "utf8"));
  } catch {
    // oasdiff read the file, so this only loses the deprecation lookup.
  }
  const seen = new Set();
  const problems = [];
  for (const f of [...breaking.findings, ...changelog.findings]) {
    if (IGNORED_IDS.has(f.id)) continue;
    let text = f.text;
    if (f.id === REMOVED_OPTIONAL_RESPONSE_PROPERTY) {
      if (propertyRemovalAllowed(referenceDoc, f)) continue;
    } else if (REMOVED_RESPONSE_HEADER.has(f.id)) {
      const header = removedHeader(referenceDoc, f);
      if (header?.allowed) continue;
      if (header) text = text.replace(`\`${header.name.toLowerCase()}\``, `\`${header.name}\``);
    } else if (!ERROR_LEVELS.has(f.level)) {
      continue;
    }
    const message = [text, f.operation && f.path ? `(${f.operation} ${f.path})` : f.path ? `(${f.path})` : ""].filter(Boolean).join(" ");
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
