// Shared fixtures for the CT2 tests: small OpenAPI documents built in memory and
// temporary directories removed after each test. Not a test file itself.
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const tmpDirs = [];
// A temporary directory with its real path (on macOS the temp folder is a symlink).
export function makeTempDir(prefix) {
  const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), prefix)));
  tmpDirs.push(dir);
  return dir;
}
export function removeTempDirs() {
  while (tmpDirs.length) rmSync(tmpDirs.pop(), { recursive: true, force: true });
}

export function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

// A contract with GET /health and GET /me. `me` lists the properties of the Me schema:
// { name: { type, required } }. `stub` marks GET /me with x-stub: true. `extraPath` adds
// one more operation, GET <extraPath>.
export function makeContract({ me = { id: { type: "string", required: true } }, stub = false, extraPath = null } = {}) {
  const properties = {};
  const required = [];
  for (const [name, { type, required: isRequired }] of Object.entries(me)) {
    properties[name] = { type, title: name };
    if (isRequired) required.push(name);
  }
  const meOperation = {
    operationId: "get_me",
    summary: "The signed-in user",
    responses: {
      200: {
        description: "The signed-in user",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Me" } } },
      },
    },
  };
  if (stub) meOperation["x-stub"] = true;
  const paths = {
    "/health": {
      get: {
        operationId: "get_health",
        summary: "Health check",
        responses: {
          200: {
            description: "Healthy",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
          },
        },
      },
    },
    "/me": { get: meOperation },
  };
  if (extraPath) {
    paths[extraPath] = {
      get: {
        operationId: `get_${extraPath.replace(/\W/g, "")}`,
        summary: "Another operation",
        responses: {
          200: {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
          },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "TripMate API", version: "0.0.0" },
    paths,
    components: {
      schemas: {
        Health: {
          type: "object",
          title: "Health",
          properties: { status: { type: "string", title: "status" } },
          required: ["status"],
        },
        Me: { type: "object", title: "Me", properties, required },
      },
    },
  };
}
