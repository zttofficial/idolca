// 團體 → 成員兩層篩選和關鍵字搜尋，市場和收藏冊共用。
// 團體、成員比對不分大小寫和前後空白（自由上鏈的卡是用戶自己填的，寫法不一定一致）；選項顯示第一次出現的寫法，附數量

export const nameKey = (s: string) => s.trim().toLowerCase();
export const sameName = (a: string, b: string) => nameKey(a) === nameKey(b);

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

// 團體、成員條件，沒選的那層全部通過
export const inGroupMember = (x: GroupMember, group: string | null, member: string | null) => (!group || sameName(x.group, group)) && (!member || sameName(x.member, member));

export type Facet = { name: string; count: number };
const byName = (a: Facet, b: Facet) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

// 各團體的數量，以及選定團體裡各成員的數量，按名稱排序。一次走完清單，幾千張卡也不卡
export function groupMemberFacets<T>(items: T[], at: (x: T) => GroupMember, group: string | null) {
  const groups = new Map<string, Facet>();
  const members = new Map<string, Facet>();
  const add = (map: Map<string, Facet>, name: string) => {
    const key = nameKey(name);
    if (!key) return;
    const f = map.get(key);
    if (f) f.count++;
    else map.set(key, { name: name.trim(), count: 1 });
  };
  for (const x of items) {
    const { group: g, member: m } = at(x);
    add(groups, g);
    if (group && sameName(g, group)) add(members, m);
  }
  return { total: items.length, groups: [...groups.values()].sort(byName), members: [...members.values()].sort(byName) };
}

// 從選項清單裡找某個名稱的數量
export const countOf = (facets: Facet[], name: string) => facets.find((f) => sameName(f.name, name))?.count ?? 0;
