// The translation check (EPIC-11 spec, section 2.9). Library and command:
//   checkTranslations(dir) -> { problems: [{ key, message, lang?, file? }] }
//   node scripts/check-translations.js [dir]   (dir defaults to "translations")
import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

const LANGS = ["en", "vi"];

// The set of "name:type" for every argument of a parsed message, branches and tags included.
function placeholders(elements, found = new Set()) {
  for (const el of elements) {
    switch (el.type) {
      case TYPE.argument:
        found.add(`${el.value}:argument`);
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
        for (const option of Object.values(el.options)) placeholders(option.value, found);
        break;
      case TYPE.plural:
        found.add(`${el.value}:${el.pluralType === "ordinal" ? "selectordinal" : "plural"}`);
        for (const option of Object.values(el.options)) placeholders(option.value, found);
        break;
      case TYPE.tag:
        found.add(`${el.value}:tag`);
        placeholders(el.children, found);
        break;
      default:
        break; // literal, pound
    }
  }
  return found;
}

const sortedList = (set) => [...set].sort().join(", ");

async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function checkTranslations(dir) {
  const problems = [];
  const add = (problem) => problems.push(problem);

  const top = await listDir(dir);
  if (top === null) {
    add({ key: null, message: `The translations folder ${dir} does not exist`, file: "." });
    return { problems };
  }

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
    const entries = await listDir(path.join(dir, lang));
    if (entries === null) {
      add({ key: null, message: `The folder ${lang} is missing`, lang, file: lang });
      continue;
    }
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
        data = JSON.parse(await readFile(path.join(dir, lang, entry.name), "utf8"));
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
  const pick = (list) => list.find((o) => o.file.endsWith(`/${o.area}.json`)) ?? list[0];
  const parsed = { en: new Map(), vi: new Map() };

  for (const lang of LANGS) {
    for (const [key, list] of byLang[lang]) {
      for (const occurrence of list) {
        try {
          const ast = parse(occurrence.message);
          if (occurrence === pick(list)) parsed[lang].set(key, placeholders(ast));
        } catch (error) {
          add({
            key,
            message: `${occurrence.file}: invalid ICU message: ${error.message ?? error.kind ?? error}`,
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
        file: pick(byLang.en.get(key)).file,
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

const invoked = process.argv[1] && import.meta.url === pathToFileURL(await realpath(process.argv[1])).href;
if (invoked) {
  process.exitCode = await main();
}
