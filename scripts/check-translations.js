// The translation check (EPIC-11 spec, section 2.9). Library and command:
//   checkTranslations(dir) -> { problems: [{ key, message, lang?, file? }] }
//   node scripts/check-translations.js [dir]   (dir defaults to "translations")
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

const LANGS = ["en", "vi"];
// Files the operating system writes; ignored in the translations folder and in language folders.
const OS_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

// The set of "name:type" for every argument of a parsed message, branches and tags included.
// Inside a plural or selectordinal, {n} of its own argument counts as # (task 1.2), so it is skipped.
function placeholders(elements, found = new Set(), own = new Set()) {
  for (const el of elements) {
    switch (el.type) {
      case TYPE.argument:
        if (!own.has(el.value)) found.add(`${el.value}:argument`);
        break;
      case TYPE.number:
        found.add(`${el.value}:number`);
        break;
      case TYPE.date:
        found.add(`${el.value}:date`);
        break;
      case TYPE.time:
        found.add(`${el.value}:time`);
        break;
      case TYPE.select:
        found.add(`${el.value}:select`);
        for (const option of Object.values(el.options)) placeholders(option.value, found, own);
        break;
      case TYPE.plural:
        found.add(`${el.value}:${el.pluralType === "ordinal" ? "selectordinal" : "plural"}`);
        for (const option of Object.values(el.options)) {
          placeholders(option.value, found, new Set([...own, el.value]));
        }
        break;
      case TYPE.tag:
        found.add(`${el.value}:tag`);
        placeholders(el.children, found, own);
        break;
      default:
        break; // literal, pound
    }
  }
  return found;
}

const where = (error) => {
  const start = error?.location?.start;
  return start ? ` at ${start.line}:${start.column}` : "";
};

const sortedList = (set) => [...set].sort().join(", ");

async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error.code === "ENOTDIR") return "not-a-folder";
    throw error;
  }
}

export async function checkTranslations(dir) {
  const problems = [];
  const add = (problem) => problems.push(problem);

  const topAll = await listDir(dir);
  if (topAll === null || topAll === "not-a-folder") {
    const what = topAll === null ? "does not exist" : "is a file, not a folder";
    add({ key: null, message: `The translations folder ${dir} ${what}`, file: "." });
    return { problems };
  }
  const top = topAll.filter((entry) => !OS_FILES.has(entry.name));

  for (const entry of top) {
    if (entry.isDirectory()) {
      if (!LANGS.includes(entry.name)) {
        add({ key: null, message: `The folder ${entry.name} is not a language (only en and vi)`, file: entry.name });
      }
    } else {
      add({ key: null, message: `The file ${entry.name} is not in a language folder`, file: entry.name });
    }
  }

  // byLang[lang]: Map key -> [{ file, area, message }]
  const byLang = Object.fromEntries(LANGS.map((lang) => [lang, new Map()]));

  for (const lang of LANGS) {
    const all = await listDir(path.join(dir, lang));
    if (all === null || all === "not-a-folder") {
      add({ key: null, message: `The folder ${lang} is missing`, lang, file: lang });
      continue;
    }
    const entries = all.filter((entry) => !OS_FILES.has(entry.name));
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${lang}/${entry.name}`;
      if (entry.isDirectory()) {
        add({ key: null, message: `${rel} is a folder; only .json files are allowed`, lang, file: rel });
        continue;
      }
      if (!entry.name.endsWith(".json")) {
        add({ key: null, message: `${rel} is not a .json file`, lang, file: rel });
        continue;
      }
      const area = entry.name.slice(0, -".json".length);
      let data;
      try {
        data = JSON.parse((await readFile(path.join(dir, lang, entry.name), "utf8")).replace(/^\uFEFF/, ""));
      } catch (error) {
        add({ key: null, message: `${rel} is not valid JSON: ${error.message}`, lang, file: rel });
        continue;
      }
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        add({ key: null, message: `${rel} must be one flat JSON object`, lang, file: rel });
        continue;
      }
      for (const [key, value] of Object.entries(data)) {
        if (typeof value !== "string") {
          add({ key, message: `${rel}: the value of ${key} must be a string (a flat object of strings)`, lang, file: rel });
          continue;
        }
        if (!key.startsWith(`${area}.`)) {
          add({ key, message: `${rel}: the key ${key} does not start with the area of its file (${area}.)`, lang, file: rel });
        }
        const list = byLang[lang].get(key) ?? [];
        list.push({ file: rel, area, message: value });
        byLang[lang].set(key, list);
      }
    }
  }

  // The occurrence to judge: the one in the file of the key's area, else the first.
  const inArea = (key, o) => key.startsWith(`${o.area}.`);
  const pick = (key, list) => list.find((o) => inArea(key, o)) ?? list[0];
  const parsed = { en: new Map(), vi: new Map() };

  for (const lang of LANGS) {
    for (const [key, list] of byLang[lang]) {
      const chosen = pick(key, list);
      for (const occurrence of list) {
        // A wrong-area copy is reported as wrong-area only, unless it is the only copy.
        if (occurrence !== chosen && !inArea(key, occurrence)) continue;
        try {
          const ast = parse(occurrence.message);
          if (occurrence === chosen) parsed[lang].set(key, placeholders(ast));
        } catch (error) {
          add({
            key,
            message: `${occurrence.file}: invalid ICU message${where(error)}: ${error.message ?? error.kind ?? error}`,
            lang,
            file: occurrence.file,
          });
        }
      }
    }
  }

  const [a, b] = LANGS;
  for (const [from, to] of [[a, b], [b, a]]) {
    for (const [key, list] of byLang[from]) {
      if (!byLang[to].has(key)) {
        const file = list[0].file;
        add({ key, message: `${file}: the key ${key} is in ${from} only; add it to ${to}`, lang: from, file });
      }
    }
  }

  for (const [key, enSet] of parsed.en) {
    const viSet = parsed.vi.get(key);
    if (!viSet) continue;
    const enText = sortedList(enSet);
    const viText = sortedList(viSet);
    if (enText !== viText) {
      add({
        key,
        message: `Different placeholders in en and vi: en has [${enText}], vi has [${viText}]`,
        file: pick(key, byLang.en.get(key)).file,
      });
    }
  }

  return { problems };
}

async function main() {
  const dir = process.argv[2] ?? "translations";
  const { problems } = await checkTranslations(dir);
  if (problems.length === 0) {
    console.log(`Translations OK (${dir})`);
    return 0;
  }
  for (const p of problems) {
    console.error(`${p.key ?? "-"}\t${p.message}`);
  }
  console.error(`${problems.length} translation problem(s) in ${dir}`);
  return 1;
}

if (import.meta.main) {
  process.exitCode = await main();
}
