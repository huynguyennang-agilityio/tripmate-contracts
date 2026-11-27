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

// `reference` and `current` are { file (what oasdiff reads), name (what a message calls it) }.
function runOasdiff(command, tag, reference, current) {
  const run = spawnSync(
    oasdiffBinary(),
    [command, path.resolve(reference.file), path.resolve(current.file), "--format", "json", "--allow-external-refs=false"],
    // TZ=UTC: oasdiff compares `x-sunset` with today's date in the process's time zone; the
    // check's "today" is always the UTC date.
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, TZ: "UTC" } },
  );
  // oasdiff may read temp copies; a message names the document, not the copy.
  const named = (text) =>
    [reference, current].reduce((t, doc) => t.split(path.resolve(doc.file)).join(doc.name), text);
  const fail = (message) => ({ error: { tag, message: named(message) } });
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

// `x-sunset` as oasdiff reads it: an RFC 3339 full-date  or date-time
// (`2020-01-01T00:00:00Z`, with a fraction and a `Z` or `+HH:MM` offset). Returns the UTC date
//  or null for a malformed value or a date that does not exist.
const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;
function sunsetUtcDate(value) {
  if (typeof value !== "string") return null;
  const match = FULL_DATE.exec(value) ?? DATE_TIME.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1, 4).map(Number);
  const check = new Date(Date.UTC(2000, month - 1, day));
  check.setUTCFullYear(year);
  if (month < 1 || month > 12 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  if (match.length === 4) return value;
  const [hour, minute, second] = match.slice(4, 7).map(Number);
  // RFC 3339 allows :60 only for a leap second, which the check treats as not reached (decision P3).
  if (hour > 23 || minute > 59 || second > 59) return null;
  let offset = 0;
  if (match[7]) {
    const [oh, om] = [Number(match[8]), Number(match[9])];
    if (oh > 23 || om > 59) return null;
    offset = (match[7] === "-" ? -1 : 1) * (oh * 60 + om);
  }
  const instant = Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60000;
  return new Date(instant).toISOString().slice(0, 10);
}

// A removal is allowed when the node is marked `deprecated: true` and its `x-sunset` is absent,
// today (UTC), or past. A `$ref` node is read before the ref is resolved (OpenAPI 3.1 allows
// `deprecated` beside `$ref`), then the target. An invalid or malformed date is not reached.
function removalAllowed(doc, node, today = new Date().toISOString().slice(0, 10)) {
  const own = node && typeof node === "object" ? node : {};
  const target = resolveRef(doc, node) ?? {};
  const deprecated = own.deprecated === true || target.deprecated === true;
  if (!deprecated) return false;
  const sunset = own["x-sunset"] ?? target["x-sunset"];
  if (sunset === undefined || sunset === null) return true;
  const date = sunsetUtcDate(sunset);
  return date !== null && date <= today;
}

// The readings of `path` (oasdiff's name of a property: segments joined by `/`, with `items`,
// `allOf[subschema #N]`, `oneOf[...]`, `anyOf[...]`; a property name may contain `/` itself) below
// `schema`: each is { node (as written, a `$ref` node is not resolved), steps }, where `steps` is
// the way down, to follow in another document. Every step consumes part of `path`, so the
// recursion ends (a `$ref` cycle included).
function schemaNodes(doc, schema, path, steps = []) {
  if (path === "") return [{ node: schema, steps }];
  const resolved = resolveRef(doc, schema);
  if (!resolved || typeof resolved !== "object") return [];
  const found = [];
  const step = (prefix, next, taken) => {
    if (next !== undefined && path.startsWith(prefix)) found.push(...schemaNodes(doc, next, path.slice(prefix.length), [...steps, taken]));
  };
  step("items/", resolved.items, { items: true });
  for (const kind of ["allOf", "oneOf", "anyOf"]) {
    (resolved[kind] ?? []).forEach?.((sub, i) => step(`${kind}[subschema #${i + 1}]/`, sub, { kind, i }));
  }
  for (const [name, property] of Object.entries(resolved.properties ?? {})) {
    if (path === name) found.push({ node: property, steps: [...steps, { name }] });
    else step(`${name}/`, property, { name });
  }
  return found;
}

// The node at `steps` below `schema` in `doc`, or undefined when it is not there.
function followSteps(doc, schema, steps) {
  let node = schema;
  for (const s of steps) {
    const resolved = resolveRef(doc, node);
    if (!resolved || typeof resolved !== "object") return undefined;
    if (s.items) node = resolved.items;
    else if (s.kind) node = Array.isArray(resolved[s.kind]) ? resolved[s.kind][s.i] : undefined;
    else node = Object.hasOwn(resolved.properties ?? {}, s.name) ? resolved.properties[s.name] : undefined;
    if (node === undefined) return undefined;
  }
  return node;
}

function operationOf(doc, finding) {
  return doc?.paths?.[finding.path]?.[String(finding.operation ?? "").toLowerCase()];
}

// True when the property that `finding` says was removed is marked deprecated in `doc` (the
// reference document), and its x-sunset allows the removal. A name with `/` has several readings;
// those that exist in `doc` and are gone from `newDoc` are the removed ones, and all of them must
// allow the removal. Anything that cannot be found is not deprecated.
function propertyRemovalAllowed(doc, newDoc, finding) {
  const named = /property `([^`]+)`.*response with the `([^`]+)` status/.exec(finding.text ?? "");
  const operation = operationOf(doc, finding);
  if (!named || !operation) return false;
  const response = resolveRef(doc, operation.responses?.[named[2]]);
  const newResponse = resolveRef(newDoc, operationOf(newDoc, finding)?.responses?.[named[2]]);
  const removed = [];
  for (const [mediaType, media] of Object.entries(response?.content ?? {})) {
    const newSchema = newResponse?.content?.[mediaType]?.schema;
    for (const { node, steps } of schemaNodes(doc, media?.schema, named[1])) {
      if (followSteps(newDoc, newSchema, steps) === undefined) removed.push(node);
    }
  }
  return removed.length > 0 && removed.every((node) => removalAllowed(doc, node));
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

// A copy of a document (the reference and the new one alike, so that an item that did not change
// compares equal) where every `x-sunset` is re-rated by `sunsetUtcDate` before oasdiff reads it: a
// valid value becomes its UTC date `YYYY-MM-DD`, an invalid one (also a leap second or the offset
// +24:00, which oasdiff accepts, and a non-string value, which is rewritten too) becomes a value
// oasdiff refuses; a null `x-sunset` is dropped. So
// oasdiff's own sunset findings (`*-removed-before-sunset`, `*-sunset-parse`,
// `*-removed-with-deprecation`, the required-property ones) follow the check's date rule, also the
// removals it passes in silence. A property named `x-sunset` holds an object and is left alone.
function normalizeSunsets(node) {
  if (Array.isArray(node)) return node.map(normalizeSunsets);
  if (node === null || typeof node !== "object") return node;
  const copy = {};
  for (const [key, child] of Object.entries(node)) {
    if (key === "x-sunset" && (child === null || typeof child !== "object")) {
      if (child === null) continue;
      copy[key] = sunsetUtcDate(child) ?? "invalid";
    } else {
      copy[key] = normalizeSunsets(child);
    }
  }
  return copy;
}

// A copy of `file` with its x-sunset values re-rated, in `dir`; the file itself when it is not JSON
// (oasdiff reports that).
function ratedCopy(file, dir, name) {
  try {
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const copy = path.join(dir, name);
    writeFileSync(copy, JSON.stringify(normalizeSunsets(doc)));
    return copy;
  } catch {
    return file;
  }
}

function compare(reference, file) {
  const dir = mkdtempSync(path.join(tmpdir(), "check-breaking-rated-"));
  try {
    const rated = { file: ratedCopy(reference.file, dir, "reference.json"), name: `openapi.json at ${reference.tag}` };
    const current = { file: ratedCopy(file, dir, "new.json"), name: file };
    return compareRated(reference, file, rated, current);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function compareRated(reference, file, rated, current) {
  // `breaking` lists the error and warning findings; `changelog` also lists the info ones, where
  // the removal of an optional response property is.
  const breaking = runOasdiff("breaking", reference.tag, rated, current);
  if (breaking.error) return [breaking.error];
  const changelog = runOasdiff("changelog", reference.tag, rated, current);
  if (changelog.error) return [changelog.error];
  let referenceDoc = null;
  try {
    referenceDoc = JSON.parse(readFileSync(reference.file, "utf8"));
  } catch {
    // oasdiff read the file, so this only loses the deprecation lookup.
  }
  let newDoc = null;
  try {
    newDoc = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // Same: every reading then counts as removed.
  }
  const seen = new Set();
  const problems = [];
  for (const f of [...breaking.findings, ...changelog.findings]) {
    if (IGNORED_IDS.has(f.id)) continue;
    let text = f.text;
    if (f.id === REMOVED_OPTIONAL_RESPONSE_PROPERTY) {
      if (propertyRemovalAllowed(referenceDoc, newDoc, f)) continue;
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
