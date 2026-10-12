// 盲盒卡包（Mystery Pack）：卡池是平台放進這個卡包的金庫卡，每張都是金庫裡的一張實物，抽一張少一張。
// 機率不是固定設定，而是「該等級剩餘張數 ÷ 卡池剩餘總數」，隨庫存即時變化、公開可算。
// 抽到的卡就是那張金庫卡的 NFT，從平台錢包轉進買家錢包；公平性見 src/lib/server/pack-draw.ts

import type { Card } from "./cards";

export type Tier = "SSR" | "SR" | "R" | "N";
export const TIERS: Tier[] = ["SSR", "SR", "R", "N"];

// 等級的識別色只用在卡框光暈和色條上，文字一律用文字色
export const TIER_COLOR: Record<Tier, string> = {
  SSR: "#d9a21b",
  SR: "#e8285a",
  R: "#3b6fd8",
  N: "#9a9aa3",
};

// 卡池裡的一張卡。total 恆為 1（每張是一件實物），remaining 是 1（還在卡池）或 0（已被抽走）
export type PoolEntry = {
  id: string;
  card: Card;
  tier: Tier;
  valueUsdt: number;
  total: number;
  remaining: number;
};

export type Pack = {
  id: string;
  name: string;
  priceUsdt: number;
  // 一筆訂單最多開幾包
  maxQty: number;
  startsAt: string;
  endsAt: string;
  palette: [string, string];
  // 種子的 SHA-256，開賣前公開
  seedHash: string;
  // 卡包結束或抽完後才公開
  seed: string | null;
  pool: PoolEntry[];
};

export type TierStats = { tier: Tier; remaining: number; total: number; odds: number; minValue: number; maxValue: number };

// 返還率上限：剩下卡池的單包期望價值 ÷ 售價。超過就暫停販售（頁面顯示補貨中），等補進便宜的卡再恢復：
// 一來卡包不會賣虧（賣完時的利潤 = 張數 × 售價 − 卡池總價值），二來便宜的卡被抽完後，沒人能撿期望值高過售價的尾單。
// 每個卡包實際的返還率由售價和卡池決定，只要不超過上限；頁面公開期望價值和返還率。用 NEXT_PUBLIC_PACK_MAX_RTP 調，預設 0.8
export const MAX_RTP = Number(process.env.NEXT_PUBLIC_PACK_MAX_RTP) || 0.8;
export const overRtp = (expectedUsdt: number, priceUsdt: number) => priceUsdt > 0 && expectedUsdt / priceUsdt > MAX_RTP + 1e-9;

export function packStats(pack: Pick<Pack, "pool" | "priceUsdt">) {
  const remaining = pack.pool.reduce((n, e) => n + e.remaining, 0);
  const total = pack.pool.reduce((n, e) => n + e.total, 0);
  const tiers: TierStats[] = TIERS.map((tier) => {
    const es = pack.pool.filter((e) => e.tier === tier);
    const r = es.reduce((n, e) => n + e.remaining, 0);
    const values = es.map((e) => e.valueUsdt);
    return {
      tier,
      remaining: r,
      total: es.reduce((n, e) => n + e.total, 0),
      odds: remaining ? r / remaining : 0,
      minValue: values.length ? Math.min(...values) : 0,
      maxValue: values.length ? Math.max(...values) : 0,
    };
  });
  // 按當前剩餘卡池計算的單包期望價值，公開給用戶看
  const expected = remaining ? pack.pool.reduce((v, e) => v + e.valueUsdt * e.remaining, 0) / remaining : 0;
  const left = pack.pool.filter((e) => e.remaining > 0).map((e) => e.valueUsdt);
  const topValue = left.length ? Math.max(...left) : 0;
  // 整個卡池（含已抽走的）賣完時的返還率和利潤，給後台看
  const poolValue = pack.pool.reduce((v, e) => v + e.valueUsdt * e.total, 0);
  const sellOutRtp = total && pack.priceUsdt ? poolValue / (total * pack.priceUsdt) : 0;
  const sellOutProfit = total * pack.priceUsdt - poolValue;
  // 當前剩餘卡池的返還率；超過上限時暫停販售
  const rtp = pack.priceUsdt ? expected / pack.priceUsdt : 0;
  const paused = remaining > 0 && overRtp(expected, pack.priceUsdt);
  return { remaining, total, tiers, expected, topValue, rtp, paused, sellOutRtp, sellOutProfit };
}

// 卡池條目渲染成卡片：價格欄顯示卡包給它的價值
export const entryCard = (entry: PoolEntry): Card => ({ ...entry.card, priceUsdt: entry.valueUsdt });

// 抽卡的排序：卡池按編號排序，第 pick 張就是抽中的卡。公開種子後任何人都能照這個順序重算
export const poolOrder = <T extends { card: { serial: string } }>(pool: T[]) => [...pool].sort((a, b) => a.card.serial.localeCompare(b.card.serial));

// 隨機數 r（HMAC 的前 6 個位元組，十六進位）換成卡池裡的位置
export const pickIndex = (rHex: string, poolSize: number) => Math.floor((parseInt(rHex.slice(0, 12), 16) / 2 ** 48) * poolSize);

// 即時回購：按卡片價值的固定比例，USDT 直接到錢包
export const BUYBACK_RATE = 0.7;
export const MAX_QTY = 10;
