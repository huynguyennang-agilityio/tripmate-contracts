// CT2 Draft and release tags: cases CT2-1, CT2-2, CT2-3, CT2-7, and CT2-8, the tag a merge
// to main gets. The interface these tests rely on is in tests/INTERFACE.md.
import { test, expect } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot, makeContract } from "./CT2-helpers.js";

const modulePath = path.join(repoRoot, "scripts", "contract-version.js");

// Imported inside each test, so a missing module fails that test only.
async function loadNextTag() {
  const mod = await import(pathToFileURL(modulePath).href);
  expect(typeof mod.nextTag).toBe("function");
  return mod.nextTag;
}

const plain = () => makeContract();
const withStub = () => makeContract({ stub: true });

test("CT2-1 a merged contract with one operation marked x-stub gets a draft tag contracts-vX.Y.Z-draft.1", async () => {
  const nextTag = await loadNextTag();

  // No tag yet: the first draft of 0.1.0.
  expect(
    nextTag({ tags: [], changedPaths: ["openapi.json"], contract: withStub(), previousContract: null }),
  ).toBe("contracts-v0.1.0-draft.1");

  // After a release: the first draft of the next minor version.
  expect(
    nextTag({
      tags: ["contracts-v0.1.0", "contracts-v0.1.0-draft.1"],
      changedPaths: ["openapi.json"],
      contract: withStub(),
      previousContract: plain(),
    }),
  ).toBe("contracts-v0.2.0-draft.1");

  // The spec's example: v1.3.0 to v1.4.0-draft.1.
  expect(
    nextTag({
      tags: ["contracts-v1.2.0", "contracts-v1.3.0"],
      changedPaths: ["openapi.json"],
      contract: withStub(),
      previousContract: plain(),
    }),
  ).toBe("contracts-v1.4.0-draft.1");
});

test("CT2-2 a second merge while a stub remains gets draft.2 of the same version", async () => {
  const nextTag = await loadNextTag();

  expect(
    nextTag({
      tags: ["contracts-v0.1.0-draft.1"],
      changedPaths: ["openapi.json"],
      contract: withStub(),
      previousContract: withStub(),
    }),
  ).toBe("contracts-v0.1.0-draft.2");

  // The draft keeps its number until it is released, after an earlier release too.
  expect(
    nextTag({
      tags: ["contracts-v1.3.0", "contracts-v1.4.0-draft.1"],
      changedPaths: ["openapi.json"],
      contract: makeContract({ stub: true, extraPath: "/trips" }),
      previousContract: withStub(),
    }),
  ).toBe("contracts-v1.4.0-draft.2");
});

test("CT2-3 a merged contract with no stub gets a release tag contracts-vX.Y.Z", async () => {
  const nextTag = await loadNextTag();

  // No tag yet: the first release.
  expect(
    nextTag({ tags: [], changedPaths: ["openapi.json"], contract: plain(), previousContract: null }),
  ).toBe("contracts-v0.1.0");

  // After a draft: the release of that version.
  expect(
    nextTag({
      tags: ["contracts-v1.3.0", "contracts-v1.4.0-draft.1", "contracts-v1.4.0-draft.2"],
      changedPaths: ["openapi.json"],
      contract: plain(),
      previousContract: withStub(),
    }),
  ).toBe("contracts-v1.4.0");

  // After a release, adding an operation: the next minor version.
  expect(
    nextTag({
      tags: ["contracts-v1.3.0"],
      changedPaths: ["openapi.json"],
      contract: makeContract({ extraPath: "/trips" }),
      previousContract: plain(),
    }),
  ).toBe("contracts-v1.4.0");

  // After a release, adding a field: the next minor version.
  expect(
    nextTag({
      tags: ["contracts-v1.3.0"],
      changedPaths: ["openapi.json"],
      contract: makeContract({ me: { id: { type: "string", required: true }, nickname: { type: "string", required: false } } }),
      previousContract: plain(),
    }),
  ).toBe("contracts-v1.4.0");

  // After a release, a change to events.schema.json: the next minor version.
  expect(
    nextTag({
      tags: ["contracts-v1.3.0"],
      changedPaths: ["events.schema.json"],
      contract: plain(),
      previousContract: plain(),
    }),
  ).toBe("contracts-v1.4.0");
});

test("CT2-7 after release contracts-v0.1.0, a merge that changes only translations gets contracts-v0.1.1", async () => {
  const nextTag = await loadNextTag();

  expect(
    nextTag({
      tags: ["contracts-v0.1.0", "contracts-v0.1.0-draft.1"],
      changedPaths: ["translations/en/auth.json", "translations/vi/auth.json"],
      contract: plain(),
      previousContract: plain(),
    }),
  ).toBe("contracts-v0.1.1");
});

test("CT2-8 a merge that changes only the README or a task file gets no tag", async () => {
  const nextTag = await loadNextTag();

  for (const changedPaths of [["README.md"], ["tasks/EPIC-11.md"], ["README.md", "tasks/EPIC-11.md"]]) {
    expect(
      nextTag({ tags: ["contracts-v0.1.0"], changedPaths, contract: plain(), previousContract: plain() }),
    ).toBeNull();
    expect(nextTag({ tags: [], changedPaths, contract: plain(), previousContract: null })).toBeNull();
  }
});
