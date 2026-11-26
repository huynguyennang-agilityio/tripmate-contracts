// CT1 Contracts repository and translation check: cases CT1-1 to CT1-4.
// The interface these tests rely on is in tests/INTERFACE.md.
import { describe, test, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "check-translations.js");

// Imported inside each test, so a missing module fails that test only.
async function loadCheck() {
  const mod = await import(pathToFileURL(scriptPath).href);
  expect(typeof mod.checkTranslations).toBe("function");
  return mod.checkTranslations;
}

function runCli(args, cwd = repoRoot) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

const tmpDirs = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

// files: { "en/auth.json": { "auth.x": "..." }, ... }; a string value is written as is.
function makeTranslations(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "ct1-translations-"));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, ...rel.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf8");
  }
  return dir;
}

async function check(dir) {
  const checkTranslations = await loadCheck();
  const result = await checkTranslations(dir);
  expect(Array.isArray(result?.problems)).toBe(true);
  return result.problems;
}

const keysOf = (problems) => new Set(problems.map((p) => p.key));
const namesFile = (problems, name) => problems.some((p) => `${p.file ?? ""} ${p.message ?? ""}`.includes(name));

const cleanFiles = {
  "en/auth.json": {
    "auth.not_signed_in": "You are not signed in.",
    "auth.welcome": "Welcome back, {name}!",
  },
  "vi/auth.json": {
    "auth.not_signed_in": "Bạn chưa đăng nhập.",
    "auth.welcome": "Chào mừng {name} quay lại!",
  },
  "en/trip.json": {
    "trip.count": "{count, plural, one {# trip} other {# trips}}",
    "trip.starts": "Starts on {start, date, medium} at {time, time, short}",
    "trip.budget": "Budget: {amount, number}",
    "trip.role": "{role, select, owner {You own this trip} other {You are a member}}",
    "trip.place": "{rank, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} stop",
    "trip.terms": "Read the <link>terms</link>.",
  },
  "vi/trip.json": {
    "trip.count": "{count, plural, other {# chuyến đi}}",
    "trip.starts": "Bắt đầu ngày {start, date, medium} lúc {time, time, short}",
    "trip.budget": "Ngân sách: {amount, number}",
    "trip.role": "{role, select, owner {Bạn là chủ chuyến đi} other {Bạn là thành viên}}",
    "trip.place": "Điểm dừng thứ {rank, selectordinal, other {#}}",
    "trip.terms": "Đọc <link>điều khoản</link>.",
  },
};

describe("CT1 translation check", () => {
  test("CT1-1 every key in both languages, in the file of its area, with valid ICU passes the check", async () => {
    const dir = makeTranslations(cleanFiles);
    expect(await check(dir)).toEqual([]);

    const cli = runCli([dir]);
    expect(cli.status, cli.output).toBe(0);

    // The repository's own translations pass too, with the CLI's default directory.
    const ownDir = path.join(repoRoot, "translations");
    expect(existsSync(path.join(ownDir, "en")), "translations/en exists").toBe(true);
    expect(existsSync(path.join(ownDir, "vi")), "translations/vi exists").toBe(true);
    expect(readdirSync(path.join(ownDir, "en")).filter((f) => f.endsWith(".json")).length).toBeGreaterThan(0);
    expect(await check(ownDir)).toEqual([]);
    const ownCli = runCli([]);
    expect(ownCli.status, ownCli.output).toBe(0);

    // CI's translations job runs the tests and the check (CLAUDE.md, section CI).
    const ci = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
    const jobs = ci.slice(ci.search(/^jobs:\s*$/m));
    const start = jobs.search(/^  translations:\s*$/m);
    expect(start, "ci.yml has a translations job").toBeGreaterThanOrEqual(0);
    const rest = jobs.slice(start + 1);
    const next = rest.search(/^  \S/m);
    const job = next === -1 ? rest : rest.slice(0, next);
    expect(job).toMatch(/^\s*(- )?run:\s*npm test\s*$/m);
    expect(job).toMatch(/^\s*(- )?run:\s*node scripts\/check-translations\.js\s*$/m);
  });

  test("CT1-2 a key in one language only, or in the file of another area, fails the check and names the key", async () => {
    const dir = makeTranslations({
      "en/auth.json": {
        "auth.not_signed_in": "You are not signed in.",
        "auth.only_in_en": "Only in English.",
      },
      "vi/auth.json": {
        "auth.not_signed_in": "Bạn chưa đăng nhập.",
        "auth.only_in_vi": "Chỉ có tiếng Việt.",
        "trip.wrong_area": "Khóa này nằm sai tệp.",
      },
      "en/trip.json": { "trip.wrong_area": "This key is in the wrong file in Vietnamese." },
      "vi/trip.json": {},
      // A file in one language only: each of its keys is in one language only.
      "en/budget.json": { "budget.title": "Budget" },
    });

    const problems = await check(dir);
    const keys = keysOf(problems);
    expect(keys).toContain("auth.only_in_en"); // missing from vi
    expect(keys).toContain("auth.only_in_vi"); // missing from en
    expect(keys).toContain("budget.title"); // its file exists in en only
    expect(keys).toContain("trip.wrong_area"); // in vi/auth.json, area auth
    expect(keys).not.toContain("auth.not_signed_in");
    for (const p of problems) expect(typeof p.message).toBe("string");

    // The wrong-area problem names the file it is in.
    const wrongArea = problems.filter((p) => p.key === "trip.wrong_area");
    expect(
      wrongArea.some((p) => `${p.file ?? ""} ${p.message}`.includes("auth.json")),
      JSON.stringify(wrongArea),
    ).toBe(true);

    const cli = runCli([dir]);
    expect(cli.status).not.toBe(0);
    for (const key of ["auth.only_in_en", "auth.only_in_vi", "budget.title", "trip.wrong_area"]) {
      expect(cli.output).toContain(key);
    }

    // One flat JSON object of strings: a nested object and a number are each reported by key.
    // The area prefix needs its dot: authx.title is not in area auth.
    const shapeDir = makeTranslations({
      "en/auth.json": {
        "auth.ok": "Fine.",
        "auth.nested": { "inner": "Nested." },
        "auth.number": 3,
        "authx.title": "Wrong area.",
      },
      "vi/auth.json": {
        "auth.ok": "Ổn.",
        "auth.nested": { "inner": "Lồng nhau." },
        "auth.number": 3,
        "authx.title": "Sai khu vực.",
      },
    });
    const shapeProblems = await check(shapeDir);
    const shapeKeys = keysOf(shapeProblems);
    expect(shapeKeys).toContain("auth.nested");
    expect(shapeKeys).toContain("auth.number");
    expect(shapeKeys).toContain("authx.title");
    expect(shapeKeys).not.toContain("auth.ok");
    expect(namesFile(shapeProblems.filter((p) => p.key === "authx.title"), "auth.json"), JSON.stringify(shapeProblems)).toBe(true);
    const shapeCli = runCli([shapeDir]);
    expect(shapeCli.status).not.toBe(0);
    for (const key of ["auth.nested", "auth.number", "authx.title"]) expect(shapeCli.output).toContain(key);

    // Files and folders the check fails on (CLAUDE.md, section Translations); key may be null.
    const clean = {
      "en/auth.json": { "auth.ok": "Fine." },
      "vi/auth.json": { "auth.ok": "Ổn." },
    };
    const conflict = '{\n<<<<<<< HEAD\n  "trip.title": "Trip"\n=======\n  "trip.title": "Trips"\n>>>>>>> other\n}\n';
    const layoutCases = [
      ["a file that is not valid JSON", { "en/trip.json": conflict, "vi/trip.json": conflict }, "trip.json"],
      ["a folder other than en and vi", { "fr/auth.json": { "auth.ok": "Bien." } }, "fr"],
      ["a file that is not .json", { "en/notes.txt": "notes", "vi/notes.txt": "ghi chú" }, "notes.txt"],
    ];
    for (const [what, extra, name] of layoutCases) {
      const layoutDir = makeTranslations({ ...clean, ...extra });
      const layoutProblems = await check(layoutDir);
      expect(layoutProblems.length, what).toBeGreaterThan(0);
      expect(namesFile(layoutProblems, name), `${what}: ${JSON.stringify(layoutProblems)}`).toBe(true);
      for (const p of layoutProblems) expect(typeof p.message, what).toBe("string");
      const layoutCli = runCli([layoutDir]);
      expect(layoutCli.status, what).not.toBe(0);
      expect(layoutCli.output, what).toContain(name);
    }

    // A missing language folder: only en/ is present.
    const onlyEnDir = makeTranslations({ "en/auth.json": { "auth.ok": "Fine." } });
    expect((await check(onlyEnDir)).length, "only en/ present").toBeGreaterThan(0);
    expect(runCli([onlyEnDir]).status, "only en/ present").not.toBe(0);
  });

  test("CT1-3 a message with broken ICU syntax fails the check and names the key", async () => {
    const dir = makeTranslations({
      "en/auth.json": {
        "auth.welcome": "Welcome back, {name!",
        "auth.not_signed_in": "You are not signed in.",
      },
      "vi/auth.json": {
        "auth.welcome": "Chào mừng {name} quay lại!",
        "auth.not_signed_in": "Bạn chưa đăng nhập.",
      },
      "en/trip.json": { "trip.count": "{count, plural, one {# trip} other {# trips}}" },
      "vi/trip.json": { "trip.count": "{count, plural, one {# chuyến đi}}" },
    });

    const problems = await check(dir);
    const keys = keysOf(problems);
    expect(keys).toContain("auth.welcome"); // unclosed brace, en
    expect(keys).toContain("trip.count"); // plural without other, vi
    expect(keys).not.toContain("auth.not_signed_in");

    const cli = runCli([dir]);
    expect(cli.status).not.toBe(0);
    expect(cli.output).toContain("auth.welcome");
    expect(cli.output).toContain("trip.count");
  });

  test("CT1-4 a message whose two languages use different placeholders fails the check and names the key", async () => {
    const dir = makeTranslations({
      "en/trip.json": {
        "trip.renamed": "Hello, {name}!",
        "trip.retyped": "{count, plural, one {# trip} other {# trips}}",
        "trip.nested": "{count, plural, one {{owner} has # trip} other {{owner} has # trips}}",
        "trip.tag": "Read the <link>terms</link>.",
        "trip.same": "{count, plural, one {# day left} other {# days left}}",
        "trip.vi_only_arg": "Hello!",
        "trip.number": "{amount, number}",
        "trip.date_time": "{d, date}",
        "trip.ordinal": "{n, selectordinal, other {#}}",
        "trip.select": "{r, select, other {x}}",
        "trip.in_tag": "<b>{name}</b>",
        "trip.case": "{Name}",
      },
      "vi/trip.json": {
        "trip.renamed": "Xin chào {full_name}!",
        "trip.retyped": "{count} chuyến đi",
        "trip.nested": "{count, plural, other {{leader} có # chuyến đi}}",
        "trip.tag": "Đọc điều khoản.",
        "trip.same": "Còn {count, plural, other {# ngày}}",
        "trip.vi_only_arg": "Xin chào {name}!",
        "trip.number": "{amount}",
        "trip.date_time": "{d, time}",
        "trip.ordinal": "{n, plural, other {#}}",
        "trip.select": "{r, plural, other {x}}",
        "trip.in_tag": "<b>{ten}</b>",
        "trip.case": "{name}",
      },
    });

    const problems = await check(dir);
    const keys = keysOf(problems);
    expect(keys).toContain("trip.renamed"); // {name} vs {full_name}
    expect(keys).toContain("trip.retyped"); // plural vs plain argument
    expect(keys).toContain("trip.nested"); // argument inside a branch renamed
    expect(keys).toContain("trip.tag"); // a tag in en only
    expect(keys).toContain("trip.vi_only_arg"); // a placeholder in vi only
    expect(keys).toContain("trip.number"); // number vs plain argument
    expect(keys).toContain("trip.date_time"); // date vs time
    expect(keys).toContain("trip.ordinal"); // selectordinal vs plural
    expect(keys).toContain("trip.select"); // select vs plural
    expect(keys).toContain("trip.in_tag"); // argument inside a tag renamed
    expect(keys).toContain("trip.case"); // names are case-sensitive
    expect(keys).not.toContain("trip.same"); // branches differ, arguments match

    const failing = [
      "trip.renamed", "trip.retyped", "trip.nested", "trip.tag", "trip.vi_only_arg", "trip.number",
      "trip.date_time", "trip.ordinal", "trip.select", "trip.in_tag", "trip.case",
    ];
    const cli = runCli([dir]);
    expect(cli.status).not.toBe(0);
    for (const key of failing) {
      expect(cli.output).toContain(key);
    }

    // Plural branches that differ while the arguments match do not fail the check.
    const okDir = makeTranslations({
      "en/trip.json": {
        "trip.same": "{count, plural, =0 {No trips} one {# trip with {owner}} other {# trips with {owner}}}",
      },
      "vi/trip.json": { "trip.same": "{count, plural, other {# chuyến đi với {owner}}}" },
    });
    expect(await check(okDir)).toEqual([]);
    const okCli = runCli([okDir]);
    expect(okCli.status, okCli.output).toBe(0);
  });
});
