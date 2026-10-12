import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 八種語言的介面文字：鍵要一致，每條文字裡的 ICU 參數（{price} 這類）和標籤（<terms> 這類）也要一致
const LOCALES = ["en", "zh-Hant", "zh-Hans", "ja", "ko", "th", "id", "vi"];
type Tree = { [k: string]: string | Tree };
const load = (l: string) => JSON.parse(readFileSync(`messages/${l}.json`, "utf8")) as Tree;
const flat = (o: Tree, p = ""): [string, string][] => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));
const params = (s: string) => [...new Set([...s.matchAll(/\{(\w+)/g)].map((m) => m[1]))].sort();
const tags = (s: string) => [...new Set([...s.matchAll(/<(\w+)>/g)].map((m) => m[1]))].sort();

const base = new Map(flat(load("en")));

describe.each(LOCALES.slice(1))("%s", (locale) => {
  const messages = new Map(flat(load(locale)));

  it("has exactly the same keys as English", () => {
    expect([...messages.keys()].sort()).toEqual([...base.keys()].sort());
  });

  it("uses the same placeholders and tags in every message", () => {
    for (const [key, en] of base) {
      const text = messages.get(key) ?? "";
      expect({ key, params: params(text), tags: tags(text) }).toEqual({ key, params: params(en), tags: tags(en) });
    }
  });
});

// 程式碼裡寫死的每個鍵都要在英文裡找得到（拼字錯或誤刪的鍵，執行時才會報 MISSING_MESSAGE）。
// 只檢查 t("鍵") 這種字面寫法；用樣板字串組出來的鍵（t(`sort_${s}`)）不在這裡檢查
describe("keys used in code", () => {
  const files = (readdirSync("src", { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => join("src", f));
  const used: { file: string; key: string }[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // 同一個檔案裡不同元件可能都叫 t：每次呼叫歸給它前面最近的那個宣告
    const decls = [...src.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\((?:\{[^}]*namespace: )?"([\w.]+)"/g)].map((m) => ({ at: m.index, name: m[1], namespace: m[2] }));
    for (const name of new Set(decls.map((d) => d.name))) {
      for (const k of src.matchAll(new RegExp(String.raw`\b${name}(?:\.rich|\.markup)?\("([\w.]+)"`, "g"))) {
        const decl = decls.filter((d) => d.name === name && d.at < k.index).at(-1);
        if (decl) used.push({ file, key: `${decl.namespace}.${k[1]}` });
      }
    }
  }

  it("finds the translation calls", () => {
    expect(used.length).toBeGreaterThan(100);
  });

  it("exist in the English messages", () => {
    expect(used.filter((u) => !base.has(u.key))).toEqual([]);
  });
});
