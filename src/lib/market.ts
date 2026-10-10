// 市場的篩選、排序、分頁。參數全部放在網址查詢字串裡，可以分享、可以用瀏覽器返回。
// 先選團體再選成員（KOCA 的「切換藝人與角色」），加上類型、價格、只看在售和排序（Pocamarket 的篩選項）

import type { Card, Rarity } from "./mock-cards";

export const PAGE_SIZE = 12;
export const SORTS = ["trending", "newest", "priceAsc", "priceDesc"] as const;
export type Sort = (typeof SORTS)[number];
export const RARITIES: Rarity[] = ["album", "pob", "luckydraw", "fansign"];

export type MarketQuery = {
  q: string;
  group: string | null;
  member: string | null;
  types: Rarity[];
  min: number | null;
  max: number | null;
  listedOnly: boolean;
  sort: Sort;
  page: number;
};

const num = (v: string | null) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

export function parseQuery(sp: URLSearchParams): MarketQuery {
  const sort = sp.get("sort") as Sort;
  return {
    q: sp.get("q")?.trim() ?? "",
    group: sp.get("group") || null,
    member: sp.get("member") || null,
    types: (sp.get("type")?.split(",") ?? []).filter((t): t is Rarity => RARITIES.includes(t as Rarity)),
    min: num(sp.get("min")),
    max: num(sp.get("max")),
    listedOnly: sp.get("listed") === "1",
    sort: SORTS.includes(sort) ? sort : "trending",
    page: Math.max(1, Math.floor(num(sp.get("page")) ?? 1)),
  };
}

// 只寫非預設值，網址保持乾淨
export function toSearch(q: MarketQuery) {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.group) sp.set("group", q.group);
  if (q.member) sp.set("member", q.member);
  if (q.types.length) sp.set("type", q.types.join(","));
  if (q.min !== null) sp.set("min", String(q.min));
  if (q.max !== null) sp.set("max", String(q.max));
  if (q.listedOnly) sp.set("listed", "1");
  if (q.sort !== "trending") sp.set("sort", q.sort);
  if (q.page > 1) sp.set("page", String(q.page));
  return sp.toString();
}

// 關鍵字比對團體、成員、專輯、版本、編號，多個詞要全部命中
function matches(card: Card, q: string) {
  if (!q) return true;
  const hay = `${card.group} ${card.member} ${card.album} ${card.version} ${card.serial}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export function applyQuery(cards: Card[], q: MarketQuery) {
  const filtered = cards.filter(
    (c) =>
      matches(c, q.q) &&
      (!q.group || c.group === q.group) &&
      (!q.member || c.member === q.member) &&
      (!q.types.length || q.types.includes(c.rarity)) &&
      (q.min === null || c.priceUsdt >= q.min) &&
      (q.max === null || c.priceUsdt <= q.max) &&
      (!q.listedOnly || c.status === "listed"),
  );
  const sorted = [...filtered].sort((a, b) => {
    switch (q.sort) {
      case "newest":
        return b.intakeDate.localeCompare(a.intakeDate);
      case "priceAsc":
        return a.priceUsdt - b.priceUsdt;
      case "priceDesc":
        return b.priceUsdt - a.priceUsdt;
      default:
        return b.change24h - a.change24h;
    }
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(q.page, pages);
  return { total: sorted.length, pages, page, items: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

// 各團體、成員在目前其他篩選條件下的數量，用來在選項旁顯示
export function facetCounts(cards: Card[], q: MarketQuery) {
  const base = cards.filter((c) => matches(c, q.q) && (!q.types.length || q.types.includes(c.rarity)) && (!q.listedOnly || c.status === "listed"));
  const groups = new Map<string, number>();
  const members = new Map<string, number>();
  for (const c of base) {
    groups.set(c.group, (groups.get(c.group) ?? 0) + 1);
    if (q.group && c.group === q.group) members.set(c.member, (members.get(c.member) ?? 0) + 1);
  }
  return { groups, members };
}
