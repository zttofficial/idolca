// 品類 → 團體 → 成員三層篩選和關鍵字搜尋，市場和收藏冊共用。
// 團體名稱先對上名錄（directory.ts），別名和大小寫不同的寫法（TXT、SNSD、乃木坂46）算同一個團體，選項顯示名錄裡的名稱；
// 不在名錄裡的團體（自由上鏈的卡是用戶自己填的）比對不分大小寫和前後空白，選項顯示第一次出現的寫法。選項附數量

import { CATEGORY_KEYS, DIRECTORY_BY_CATEGORY, categoryOf, findDirectoryGroup, type CategoryKey } from "./directory";

export const nameKey = (s: string) => s.trim().toLowerCase();
export const sameName = (a: string, b: string) => nameKey(a) === nameKey(b);

// 團體的顯示名稱和比對用的鍵：名錄裡有的用名錄的名稱
export const groupName = (s: string) => findDirectoryGroup(s)?.name ?? s.trim();
const groupKey = (s: string) => nameKey(groupName(s));
export const sameGroup = (a: string, b: string) => groupKey(a) === groupKey(b);

// 關鍵字比對，多個詞要全部命中
export function hit(hay: string, q: string) {
  if (!q) return true;
  const h = hay.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => h.includes(w));
}

type GroupMember = { group: string; member: string };

// 品類、團體、成員條件，沒選的那層全部通過
export const inGroupMember = (x: GroupMember, group: string | null, member: string | null, category: CategoryKey | null = null) =>
  (!category || categoryOf(x.group) === category) && (!group || sameGroup(x.group, group)) && (!member || sameName(x.member, member));

export type Facet = { name: string; count: number };
const byName = (a: Facet, b: Facet) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

// 各團體的數量，以及選定團體裡各成員的數量，按名稱排序。一次走完清單，幾千張卡也不卡
export function groupMemberFacets<T>(items: T[], at: (x: T) => GroupMember, group: string | null) {
  const groups = new Map<string, Facet>();
  const members = new Map<string, Facet>();
  const add = (map: Map<string, Facet>, key: string, name: string) => {
    if (!key) return;
    const f = map.get(key);
    if (f) f.count++;
    else map.set(key, { name, count: 1 });
  };
  for (const x of items) {
    const { group: g, member: m } = at(x);
    add(groups, groupKey(g), groupName(g));
    if (group && sameGroup(g, group)) add(members, nameKey(m), m.trim());
  }
  return { total: items.length, groups: [...groups.values()].sort(byName), members: [...members.values()].sort(byName) };
}

// 從選項清單裡找某個名稱的數量
export const countOf = (facets: Facet[], name: string) => facets.find((f) => sameName(f.name, name))?.count ?? 0;

export type CategoryFacet = { key: CategoryKey; count: number; groups: Facet[] };

// 品類 → 團體的兩層選項。full 時列出名錄裡的全部團體（沒有卡的數量為 0），市場用；否則只列這些卡裡有的團體，收藏冊用。
// 每個品類裡有卡的團體排前面（多的在前），其餘按名稱；「其他」只在有卡時出現
export function groupTree(groups: Facet[], full: boolean): CategoryFacet[] {
  const tree = new Map(CATEGORY_KEYS.map((k) => [k, new Map<string, Facet>()]));
  if (full) for (const [c, list] of Object.entries(DIRECTORY_BY_CATEGORY)) for (const g of list) tree.get(c as CategoryKey)!.set(nameKey(g.name), { name: g.name, count: 0 });
  for (const f of groups) tree.get(categoryOf(f.name))!.set(nameKey(f.name), f);
  return CATEGORY_KEYS.map((key) => {
    const list = [...tree.get(key)!.values()].sort((a, b) => b.count - a.count || byName(a, b));
    return { key, count: list.reduce((n, f) => n + f.count, 0), groups: list };
  }).filter((c) => c.groups.length > 0 && (full ? c.key !== "other" || c.count > 0 : true));
}

// 選定團體的成員選項。full 時先按名錄的順序列出全部成員（沒有卡的數量為 0），再接名錄裡沒有、但卡上填了的成員
export function memberList(group: string | null, members: Facet[], full: boolean): Facet[] {
  if (!group) return [];
  if (!full) return members;
  const known = findDirectoryGroup(group)?.members ?? [];
  const extra = members.filter((m) => !known.some((k) => sameName(k, m.name)));
  return [...known.map((name) => ({ name, count: countOf(members, name) })), ...extra];
}
