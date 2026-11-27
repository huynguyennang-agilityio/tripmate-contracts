// The next contract tag (EPIC-11 spec, section 2.10): which tag a merge to main gets, from
// the existing tags, the paths the merge changed, and the contract before and after.
//
//   node scripts/contract-version.js [--base <rev>]
//
// Run in the git repository. It prints the next tag, or nothing when the merge gets none, and
// never creates a tag (CI does). The paths are those changed from `--base` to HEAD. The default
// base is the merge base with the last tag, so a merge whose run was skipped is picked up by the
// next run; with no tag yet it is the empty tree, so every file at HEAD counts and the contract
// that reached main before this pipeline gets the first tag (spec 2.10, version 3.1). A HEAD that
// the last tag already contains (an older merge whose run came late) gets no tag.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TAG_PREFIX = "contracts-v";
const TAG_PATTERN = /^contracts-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-draft\.([1-9]\d*))?$/;
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
// Keys whose values are sample data, not schema: they hold no field or enum value of the contract.
const SKIPPED_KEYS = new Set(["example", "examples", "default", "const"]);
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// { major, minor, patch, draft } for a contract tag name, `draft` null for a release;
// null for any other name (a tag that does not start with `contracts-v` is ignored).
export function parseTag(name) {
  const match = TAG_PATTERN.exec(name);
  if (!match) return null;
  const [major, minor, patch] = match.slice(1, 4).map(Number);
  return { name, major, minor, patch, draft: match[4] === undefined ? null : Number(match[4]) };
}

// Order by version; every draft of X.Y.Z comes before the release X.Y.Z.
function compareTags(a, b) {
  const rank = (t) => (t.draft === null ? Infinity : t.draft);
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1);
}

function highest(parsed) {
  return parsed.reduce((best, t) => (best === null || compareTags(t, best) > 0 ? t : best), null);
}

// The highest contract tag (parsed), or null.
export function lastTag(tags) {
  return highest(tags.map(parseTag).filter(Boolean));
}

// The highest release tag (parsed), or null.
export function lastRelease(tags) {
  return highest(tags.map(parseTag).filter((t) => t && t.draft === null));
}

// The highest draft tag (parsed), or null.
export function latestDraft(tags) {
  return highest(tags.map(parseTag).filter((t) => t && t.draft !== null));
}

// An operation of each path item below `items` (a map of names to path items), keyed by `where`.
function pathItemOperations(items, where, found) {
  for (const [name, item] of Object.entries(items && typeof items === "object" ? items : {})) {
    for (const method of METHODS) {
      if (item && typeof item === "object" && item[method] && typeof item[method] === "object") {
        found.push({ key: `${where}${method} ${name}`, operation: item[method] });
      }
    }
  }
}

// The operations of a contract: those of `paths`, of `webhooks`, and of every callback (of an
// operation, or in `components`), however deep.
function operations(contract) {
  const found = [];
  pathItemOperations(contract?.paths, "", found);
  pathItemOperations(contract?.webhooks, "webhook ", found);
  const callbacks = (container, where) => {
    for (const [name, callback] of Object.entries(container && typeof container === "object" ? container : {})) {
      pathItemOperations(callback, `callback ${where}/${name} `, found);
      for (const item of Object.values(callback && typeof callback === "object" ? callback : {})) {
        for (const method of METHODS) {
          if (item && typeof item === "object") callbacks(item[method]?.callbacks, `${where}/${name}/${method}`);
        }
      }
    }
  };
  const visit = (items, where) => {
    for (const [name, item] of Object.entries(items && typeof items === "object" ? items : {})) {
      for (const method of METHODS) {
        if (item && typeof item === "object") callbacks(item[method]?.callbacks, `${where}${name}/${method}`);
      }
    }
  };
  visit(contract?.paths, "");
  visit(contract?.webhooks, "webhook ");
  callbacks(contract?.components?.callbacks, "components");
  return found;
}

export function hasStub(contract) {
  return operations(contract).some(({ operation }) => operation["x-stub"] === true);
}

// Keys whose value is a map from names to things (a path, a response status, a media type, a
// header, a property): the keys of that map are names, never keywords.
const NAME_MAPS = new Set(["paths", "responses", "content", "headers", "properties", "patternProperties", "$defs", "dependentSchemas", "webhooks", "encoding"]);

// The operations, the fields (keys of a `properties` object), and the enum values of a
// document, each named by where it is, so that two documents can be compared.
function features(contract) {
  const found = new Set();
  for (const { key } of operations(contract)) found.add(`operation ${key}`);
  // mode: "keywords" (the keys are schema or OpenAPI keywords), "names" (the keys are names of a
  // name map), or "groups" (the keys are the `components` groups, or the names of the `callbacks`
  // of an operation, each a name map: of schemas, or of runtime expressions).
  const walk = (node, where, mode) => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${where}/${i}`, "keywords"));
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      const here = `${where}/${key}`;
      if (mode === "names") {
        walk(child, here, "keywords");
        continue;
      }
      if (mode === "groups") {
        walk(child, here, "names");
        continue;
      }
      // An example, a default, a constant, or an extension is data, not part of the contract's shape.
      if (SKIPPED_KEYS.has(key) || key.startsWith("x-")) continue;
      if (key === "properties" && child && typeof child === "object" && !Array.isArray(child)) {
        for (const field of Object.keys(child)) found.add(`field ${here}/${field}`);
      }
      if (key === "enum" && Array.isArray(child)) {
        for (const value of child) found.add(`enum ${here} ${JSON.stringify(value)}`);
      }
      if (key === "callbacks") walk(child, here, "groups");
      else if (NAME_MAPS.has(key)) walk(child, here, "names");
      else if (key === "components" && where === "") walk(child, here, "groups");
      else walk(child, here, "keywords");
    }
  };
  walk(contract, "", "keywords");
  return found;
}

// True when `contract` has an operation, a field, or an enum value that `previous` lacks.
export function addsToContract(contract, previous) {
  const before = features(previous);
  for (const feature of features(contract)) {
    if (!before.has(feature)) return true;
  }
  return false;
}

function isTagged(path) {
  return path === "openapi.json" || path === "events.schema.json" || path.startsWith("translations/");
}

// The next tag name, or null for no tag. Pure: no git, no file, no network.
export function nextTag({ tags, changedPaths, contract, previousContract }) {
  if (!changedPaths.some(isTagged)) return null;
  const stub = hasStub(contract);
  const last = lastTag(tags);
  const name = ({ major, minor, patch }, draft) => `${TAG_PREFIX}${major}.${minor}.${patch}${draft === null ? "" : `-draft.${draft}`}`;

  if (last === null) {
    return stub ? `${TAG_PREFIX}0.1.0-draft.1` : `${TAG_PREFIX}0.1.0`;
  }
  if (last.draft !== null) {
    // A draft keeps its version until its release.
    return stub ? name(last, last.draft + 1) : name(last, null);
  }
  const minorBump = { major: last.major, minor: last.minor + 1, patch: 0 };
  if (stub) return name(minorBump, 1);
  const adds = changedPaths.includes("events.schema.json") || (previousContract != null && addsToContract(contract, previousContract));
  return adds ? name(minorBump, null) : name({ ...last, patch: last.patch + 1 }, null);
}

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function isAncestor(a, b) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", a, b]);
  if (result.error) throw result.error;
  if (result.status > 1) throw new Error(`git merge-base --is-ancestor failed: ${String(result.stderr).trim()}`);
  return result.status === 0;
}

function main(argv) {
  let base = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base" && argv[i + 1]) base = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]} (usage: contract-version.js [--base <rev>])`);
  }
  const tags = git("tag", "--list", `${TAG_PREFIX}*`).split("\n").filter(Boolean);
  const last = lastTag(tags);
  const lastName = last?.name ?? null;
  if (lastName && base === null && isAncestor("HEAD", `${lastName}^{commit}`)) return 0;
  const diffArgs = base !== null ? [base, "HEAD"] : lastName ? [`${lastName}^{commit}...HEAD`] : [EMPTY_TREE, "HEAD"];
  const changedPaths = git("diff", "--name-only", "-z", ...diffArgs).split("\0").filter(Boolean);
  const contract = JSON.parse(readFileSync("openapi.json", "utf8"));
  const previousContract = lastName ? JSON.parse(git("show", `${lastName}:openapi.json`)) : null;
  const tag = nextTag({ tags, changedPaths, contract, previousContract });
  if (tag !== null) console.log(tag);
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
