// 盲盒卡包（Mystery Pack）：每個卡包有一個有限卡池，抽一張少一張。
// 機率不是固定設定，而是「該等級剩餘張數 ÷ 卡池剩餘總數」，所以隨庫存即時變化、公開可算。
// 卡池清單的 SHA-256 在頁面上公開（主網開賣前上鏈承諾），抽卡在 devnet 由伺服器用加密隨機數，主網改用 VRF。

import { CARDS, findCard, type Card, type Rarity } from "./mock-cards";

export type Tier = "SSR" | "SR" | "R" | "N";
export const TIERS: Tier[] = ["SSR", "SR", "R", "N"];

// 等級的識別色只用在卡框光暈和色條上，文字一律用文字色
export const TIER_COLOR: Record<Tier, string> = {
  SSR: "#d9a21b",
  SR: "#e8285a",
  R: "#3b6fd8",
  N: "#9a9aa3",
};

export type PoolEntry = {
  id: string;
  cardId: string;
  version: string;
  rarity: Rarity;
  tier: Tier;
  valueUsdt: number;
  total: number;
  remaining: number;
};

export type Pack = {
  id: string;
  name: string;
  priceUsdt: number;
  startsAt: string;
  endsAt: string;
  palette: [string, string];
  pool: PoolEntry[];
};

type EntrySpec = Omit<PoolEntry, "id" | "remaining">;

// 剩餘張數從總數開始，已開出的張數由伺服器按真實開卡紀錄扣除（見 src/lib/server/packs.ts）
function entries(packId: string, specs: EntrySpec[]): PoolEntry[] {
  return specs.map((s, i) => ({ ...s, id: `${packId}-${i}`, remaining: s.total }));
}

// 八位藝人的普通專輯卡，N 級的大宗
const albumCards = (total: number): EntrySpec[] =>
  CARDS.map((c, i) => ({
    cardId: c.id,
    version: "Album Ver.",
    rarity: "album" as const,
    tier: "N" as const,
    valueUsdt: 1,
    total: Math.floor(total / 8) + (i < total % 8 ? 1 : 0),
  }));

export const PACKS: Pack[] = [
  {
    id: "daily",
    name: "Daily Pack",
    priceUsdt: 3.3,
    startsAt: "2026-10-01T00:00:00Z",
    endsAt: "2026-10-31T15:00:00Z",
    palette: ["#ff6f93", "#e8285a"],
    pool: entries("daily", [
      { cardId: "c1", version: "Fansign Event", rarity: "fansign", tier: "SSR", valueUsdt: 1280, total: 1 },
      { cardId: "c6", version: "Fansign Event", rarity: "fansign", tier: "SSR", valueUsdt: 760, total: 1 },
      { cardId: "c2", version: "Ktown4u POB", rarity: "pob", tier: "SR", valueUsdt: 35, total: 8 },
      { cardId: "c5", version: "Soundwave POB", rarity: "pob", tier: "SR", valueUsdt: 32, total: 8 },
      { cardId: "c3", version: "Lucky Draw Round 1", rarity: "luckydraw", tier: "SR", valueUsdt: 28, total: 7 },
      { cardId: "c8", version: "Lucky Draw Round 2", rarity: "luckydraw", tier: "SR", valueUsdt: 25, total: 7 },
      { cardId: "c4", version: "Compact Ver.", rarity: "album", tier: "R", valueUsdt: 4.5, total: 75 },
      { cardId: "c7", version: "Photobook Ver.", rarity: "album", tier: "R", valueUsdt: 4.5, total: 75 },
      { cardId: "c1", version: "Jewel Case Ver.", rarity: "album", tier: "R", valueUsdt: 3.5, total: 75 },
      { cardId: "c6", version: "Jewel Case Ver.", rarity: "album", tier: "R", valueUsdt: 3.5, total: 75 },
      ...albumCards(1668),
    ]),
  },
  {
    id: "fansign-hunt",
    name: "Fansign Hunt",
    priceUsdt: 9.9,
    startsAt: "2026-10-12T12:00:00Z",
    endsAt: "2026-10-26T12:00:00Z",
    palette: ["#3a3a42", "#111114"],
    pool: entries("fansign-hunt", [
      { cardId: "c1", version: "Fansign Event", rarity: "fansign", tier: "SSR", valueUsdt: 1280, total: 1 },
      { cardId: "c6", version: "Fansign Event", rarity: "fansign", tier: "SSR", valueUsdt: 760, total: 1 },
      { cardId: "c2", version: "Ktown4u POB", rarity: "pob", tier: "SR", valueUsdt: 35, total: 12 },
      { cardId: "c5", version: "Soundwave POB", rarity: "pob", tier: "SR", valueUsdt: 32, total: 12 },
      { cardId: "c3", version: "Lucky Draw Round 1", rarity: "luckydraw", tier: "SR", valueUsdt: 28, total: 12 },
      { cardId: "c8", version: "Lucky Draw Round 2", rarity: "luckydraw", tier: "SR", valueUsdt: 25, total: 12 },
      { cardId: "c4", version: "Compact Ver.", rarity: "album", tier: "R", valueUsdt: 4.5, total: 38 },
      { cardId: "c7", version: "Photobook Ver.", rarity: "album", tier: "R", valueUsdt: 4.5, total: 38 },
      { cardId: "c1", version: "Jewel Case Ver.", rarity: "album", tier: "R", valueUsdt: 3.5, total: 37 },
      { cardId: "c6", version: "Jewel Case Ver.", rarity: "album", tier: "R", valueUsdt: 3.5, total: 37 },
      ...albumCards(300),
    ]),
  },
];

export function findPack(id: string) {
  return PACKS.find((p) => p.id === id);
}

export type TierStats = { tier: Tier; remaining: number; total: number; odds: number; minValue: number; maxValue: number };

export function packStats(pack: Pack) {
  const remaining = pack.pool.reduce((n, e) => n + e.remaining, 0);
  const total = pack.pool.reduce((n, e) => n + e.total, 0);
  const tiers: TierStats[] = TIERS.map((tier) => {
    const es = pack.pool.filter((e) => e.tier === tier);
    const r = es.reduce((n, e) => n + e.remaining, 0);
    return {
      tier,
      remaining: r,
      total: es.reduce((n, e) => n + e.total, 0),
      odds: remaining ? r / remaining : 0,
      minValue: Math.min(...es.map((e) => e.valueUsdt)),
      maxValue: Math.max(...es.map((e) => e.valueUsdt)),
    };
  });
  // 按當前剩餘卡池計算的單包期望價值，公開給用戶看
  const expected = remaining ? pack.pool.reduce((v, e) => v + e.valueUsdt * e.remaining, 0) / remaining : 0;
  const topValue = Math.max(...pack.pool.filter((e) => e.remaining > 0).map((e) => e.valueUsdt));
  return { remaining, total, tiers, expected, topValue };
}

// 卡池條目渲染成卡片：沿用樣本卡的藝人和照片，換上卡包裡的版本和價值
export function entryCard(entry: PoolEntry): Card {
  const base = findCard(entry.cardId)!;
  return { ...base, id: `${base.id}:${entry.id}`, version: entry.version, rarity: entry.rarity, priceUsdt: entry.valueUsdt, grade: undefined };
}

// 抽卡：按剩餘張數加權，不放回。主網改由鏈上 VRF 決定
export function drawFromPool(pool: PoolEntry[], count: number, random: () => number): PoolEntry[] {
  const left = pool.map((e) => ({ ...e }));
  const results: PoolEntry[] = [];
  for (let i = 0; i < count; i++) {
    const total = left.reduce((n, e) => n + e.remaining, 0);
    if (!total) break;
    let r = random() * total;
    const hit = left.find((e) => (r -= e.remaining) < 0) ?? left[left.length - 1];
    hit.remaining -= 1;
    results.push(hit);
  }
  return results;
}

// 即時回購：按卡片市值的固定比例，USDT 直接到錢包
export const BUYBACK_RATE = 0.7;
