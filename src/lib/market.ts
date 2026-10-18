// 市場的篩選、排序、分頁。參數全部放在網址查詢字串裡，可以分享、可以用瀏覽器返回。
// 品類 → 團體 → 成員三層（KOCA 的星球和「切換藝人與角色」），加上類型、價格、只看在售和排序（Pocamarket 的篩選項）。
// 兩條交易線：vault 是金庫鑑定過的卡（對應 Pocamarket 的 Official），free 是賣家自由刊登、卡在賣家手上（對應 Used 和 KOCA）

import type { Listing } from "./items";
import type { Card, Rarity } from "./cards";
import { groupMemberFacets, hit, inGroupMember } from "./facets";
import { isCategoryKey, type CategoryKey } from "./directory";

export const PAGE_SIZE = 12;
export const SORTS = ["newest", "priceAsc", "priceDesc"] as const;
export type Sort = (typeof SORTS)[number];
export const RARITIES: Rarity[] = ["album", "pob", "luckydraw", "fansign"];
export const LANES = ["vault", "free"] as const;
export type Lane = (typeof LANES)[number];

export type MarketQuery = {
  lane: Lane;
  q: string;
  cat: CategoryKey | null;
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
    lane: sp.get("lane") === "free" ? "free" : "vault",
    q: sp.get("q")?.trim() ?? "",
    cat: isCategoryKey(sp.get("cat")) ? (sp.get("cat") as CategoryKey) : null,
    group: sp.get("group") || null,
    member: sp.get("member") || null,
    types: (sp.get("type")?.split(",") ?? []).filter((t): t is Rarity => RARITIES.includes(t as Rarity)),
    min: num(sp.get("min")),
    max: num(sp.get("max")),
    listedOnly: sp.get("listed") === "1",
    sort: SORTS.includes(sort) ? sort : "newest",
    page: Math.max(1, Math.floor(num(sp.get("page")) ?? 1)),
  };
}

// 只寫非預設值，網址保持乾淨
export function toSearch(q: MarketQuery) {
  const sp = new URLSearchParams();
  if (q.lane !== "vault") sp.set("lane", q.lane);
  if (q.q) sp.set("q", q.q);
  if (q.cat) sp.set("cat", q.cat);
  if (q.group) sp.set("group", q.group);
  if (q.member) sp.set("member", q.member);
  if (q.types.length) sp.set("type", q.types.join(","));
  if (q.min !== null) sp.set("min", String(q.min));
  if (q.max !== null) sp.set("max", String(q.max));
  if (q.listedOnly) sp.set("listed", "1");
  if (q.sort !== "newest") sp.set("sort", q.sort);
  if (q.page > 1) sp.set("page", String(q.page));
  return sp.toString();
}

// 在售：一口價掛單或拍賣中（拍賣的價格是目前出價，沒人出價時是起標價）
const forSale = (c: Card) => c.status === "listed" || c.status === "auction";
const listingPrice = (l: Listing) => l.priceUsdt ?? l.auction?.highUsd ?? l.auction?.startUsd ?? 0;

// 金庫卡比對團體、成員、專輯、版本、編號
const matches = (card: Card, q: string) => hit(`${card.group} ${card.member} ${card.album} ${card.version} ${card.serial}`, q);

const paginate = <T>(sorted: T[], page: number) => {
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const p = Math.min(page, pages);
  return { total: sorted.length, pages, page: p, items: sorted.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE) };
};

export function applyQuery(cards: Card[], q: MarketQuery) {
  const filtered = cards.filter(
    (c) =>
      matches(c, q.q) &&
      inGroupMember(c, q.group, q.member, q.cat) &&
      (!q.types.length || q.types.includes(c.rarity)) &&
      // 價格篩選只看在售的卡（價格是鏈上的掛單價或拍賣的目前出價）
      ((q.min === null && q.max === null) || (forSale(c) && (q.min === null || c.priceUsdt >= q.min) && (q.max === null || c.priceUsdt <= q.max))) &&
      (!q.listedOnly || forSale(c)),
  );
  const sorted = [...filtered].sort((a, b) => {
    switch (q.sort) {
      // 按價格排序時，沒在售的卡排在最後
      case "priceAsc":
        return Number(forSale(b)) - Number(forSale(a)) || a.priceUsdt - b.priceUsdt;
      case "priceDesc":
        return Number(forSale(b)) - Number(forSale(a)) || b.priceUsdt - a.priceUsdt;
      default:
        return b.intakeDate.localeCompare(a.intakeDate);
    }
  });
  return paginate(sorted, q.page);
}

// 自由刊登：比對標題、團體、成員、專輯、版本
export function applyListingQuery(listings: Listing[], q: MarketQuery) {
  const filtered = listings.filter(
    (l) =>
      hit(`${l.title ?? ""} ${l.group} ${l.member} ${l.album ?? ""} ${l.version ?? ""}`, q.q) &&
      inGroupMember(l, q.group, q.member, q.cat) &&
      (q.min === null || listingPrice(l) >= q.min) &&
      (q.max === null || listingPrice(l) <= q.max),
  );
  const sorted = [...filtered].sort((a, b) => {
    if (q.sort === "priceAsc") return listingPrice(a) - listingPrice(b);
    if (q.sort === "priceDesc") return listingPrice(b) - listingPrice(a);
    return (b.listedAt ?? "").localeCompare(a.listedAt ?? "");
  });
  return paginate(sorted, q.page);
}

// 各團體、成員在目前其他篩選條件下的數量，用來在選項旁顯示（和收藏冊共用 facets.ts 的算法）
export function facetCounts(cards: Card[], q: MarketQuery) {
  const base = cards.filter((c) => matches(c, q.q) && (!q.types.length || q.types.includes(c.rarity)) && (!q.listedOnly || forSale(c)));
  return groupMemberFacets(base, (c) => c, q.group);
}

export function listingFacetCounts(listings: Listing[], q: MarketQuery) {
  const base = listings.filter((l) => hit(`${l.title ?? ""} ${l.group} ${l.member} ${l.album ?? ""} ${l.version ?? ""}`, q.q));
  return groupMemberFacets(base, (l) => l, q.group);
}
