import { readFileSync } from "node:fs";
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
