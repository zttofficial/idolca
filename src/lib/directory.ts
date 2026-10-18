// 團體名錄：市場和收藏冊篩選器的「品類 → 團體 → 成員」清單，也是上鏈和入庫表單裡「團體」「成員」的候選項（只是建議，表單仍可自由填寫）。
// 每個品類一份名錄（src/lib/groups/），圖鑑裡的團體（catalog.ts 的 GROUPS，都是 K-pop）併進 K-pop。合併後的清單是 GROUP_DIRECTORY。
// 不在名錄裡的團體（用戶自己填的）歸到「其他」。

import { GROUPS } from "./catalog";
import type { DirectoryGroup } from "./groups/types";
import { KPOP_GROUPS } from "./groups/kpop";
import { JPOP_GROUPS } from "./groups/jpop";
import { CPOP_GROUPS } from "./groups/cpop";
import { TPOP_GROUPS } from "./groups/tpop";

export type { DirectoryGroup };

export const CATEGORIES = ["kpop", "jpop", "cpop", "tpop"] as const;
export type Category = (typeof CATEGORIES)[number];
// 篩選用的品類：名錄的品類加上「其他」
export type CategoryKey = Category | "other";
export const CATEGORY_KEYS: CategoryKey[] = [...CATEGORIES, "other"];
export const isCategoryKey = (v: string | null): v is CategoryKey => CATEGORY_KEYS.includes(v as CategoryKey);

export type DirectoryEntry = DirectoryGroup & { category: Category };

const SOURCES: Record<Category, DirectoryGroup[]> = { kpop: KPOP_GROUPS, jpop: JPOP_GROUPS, cpop: CPOP_GROUPS, tpop: TPOP_GROUPS };

const norm = (s: string) => s.trim().toLowerCase();
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

// 各品類的名錄合併成一份；同名的團體只留第一個品類的（成員合併），圖鑑的成員併進對應的團體
function buildDirectory(): DirectoryEntry[] {
  const out = new Map<string, DirectoryEntry>();
  const add = (g: DirectoryGroup, category: Category) => {
    const hit = out.get(norm(g.name));
    if (!hit) out.set(norm(g.name), { ...g, members: g.members ? [...g.members] : undefined, category });
    else if (g.members) hit.members = [...new Set([...(hit.members ?? []), ...g.members])];
  };
  for (const c of CATEGORIES) SOURCES[c].forEach((g) => add(g, c));
  GROUPS.forEach((g) => add({ name: g.name, members: g.members }, "kpop"));
  return [...out.values()].sort(byName);
}

export const GROUP_DIRECTORY = buildDirectory();

// 名稱和別名的索引，篩選時每張卡都要查一次
const INDEX = new Map<string, DirectoryEntry>();
for (const g of GROUP_DIRECTORY) for (const n of [g.name, ...(g.aka ?? [])]) if (!INDEX.has(norm(n))) INDEX.set(norm(n), g);

// 用名稱或別名（例如 TXT、SNSD、乃木坂46）找團體
export const findDirectoryGroup = (name: string) => {
  const q = norm(name);
  return q ? INDEX.get(q) : undefined;
};

// 一個團體名稱（卡上填的寫法）屬於哪個品類；不在名錄裡的算「其他」
export const categoryOf = (group: string): CategoryKey => findDirectoryGroup(group)?.category ?? "other";

// 各品類在名錄裡的團體，篩選器列出全部團體時用
export const DIRECTORY_BY_CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c, GROUP_DIRECTORY.filter((g) => g.category === c)])) as Record<Category, DirectoryEntry[]>;

// 團體欄的建議清單：別名可以搜得到，並顯示在右側
export const groupOptions = GROUP_DIRECTORY.map((g) => ({ value: g.name, hint: g.aka?.join(" · "), keywords: g.aka }));

// 檔名裡認團體和成員用：轉小寫、去掉重音、標點都當空格，前後補空格，比對時只認整詞（LIVE 不會認成 IVE）
const words = (s: string) =>
  ` ${s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;

// 同時命中「NCT」和「NCT 127」這類互相包含的名字時，只留長的
const longest = <T>(hits: { item: T; key: string }[]) => hits.filter((h) => !hits.some((o) => o.key.length > h.key.length && o.key.includes(h.key)));

const matchAll = <T>(text: string, entries: { item: T; names: string[] }[]) =>
  longest(
    entries.flatMap(({ item, names }) =>
      names
        .map(words)
        .filter((key) => key.trim() && text.includes(key))
        .map((key) => ({ item, key })),
    ),
  );

const MEMBERS = GROUP_DIRECTORY.flatMap((g) => (g.members ?? []).map((m) => ({ item: { group: g.name, member: m }, names: [m] })));

// 從照片檔名預填表單：名稱用檔名（去掉副檔名），團體和成員按關鍵字認。
// 認出不止一個團體就整個不填；團體確定但認出多個成員就不填成員；只認出成員時，名字只屬於一個團體才反推團體。
// 團體和成員都沒認出來（例如手機拍的 IMG_1234.jpg）也不填名稱
export function parseCardFilename(filename: string): { title: string; group?: string; member?: string } | undefined {
  const base = filename.replace(/\.[^.]*$/, "").trim();
  const text = words(base);
  const title = base.slice(0, 80);
  const groups = new Set(
    matchAll(
      text,
      GROUP_DIRECTORY.map((g) => ({ item: g, names: [g.name, ...(g.aka ?? [])] })),
    ).map((h) => h.item),
  );
  if (groups.size > 1) return undefined;
  const [group] = groups;
  if (group) {
    const members = new Set(
      matchAll(
        text,
        (group.members ?? []).map((m) => ({ item: m, names: [m] })),
      ).map((h) => h.item),
    );
    return { title, group: group.name, member: members.size === 1 ? [...members][0] : undefined };
  }
  const hits = matchAll(text, MEMBERS);
  if (new Set(hits.map((h) => h.key)).size !== 1) return undefined;
  const owners = new Set(hits.map((h) => h.item.group));
  return { title, member: hits[0].item.member, group: owners.size === 1 ? hits[0].item.group : undefined };
}
