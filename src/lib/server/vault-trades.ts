import "server-only";
import { desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "./db";
import { chainCursors, vaultCards, vaultTrades } from "./schema";
import { marketTradesSince } from "./history";
import { itemTitle } from "@/lib/item-title";
import { coinMints, type Coin } from "@/lib/coins";

// 金庫卡成交紀錄：從託管程序的交易同步進 vault_trades，訂單頁列出買賣雙方的每一筆。
// 游標記在 chain_cursors，每次只讀上次之後的交易，所以誰送出的結標都收得到；第一次同步會補齊以前的成交。
// 同一筆成交以簽名去重，多個實例同時同步也不會重複
const CURSOR = "market_trades";
const FRESH_MS = 15_000;
let running: Promise<void> | null = null;
let doneAt = 0;

export function syncVaultTrades(db: Db): Promise<void> {
  if (running) return running;
  if (Date.now() - doneAt < FRESH_MS) return Promise.resolve();
  running = sync(db).finally(() => {
    running = null;
    doneAt = Date.now();
  });
  return running;
}

async function sync(db: Db) {
  const [cursor] = await db.select().from(chainCursors).where(eq(chainCursors.key, CURSOR));
  const { trades, newest } = await marketTradesSince(cursor?.signature ?? null);
  if (trades.length) {
    // 測試環境和線上共用 devnet 的託管程序，不在這個資料庫的卡跳過
    const cards = await db
      .select({ id: vaultCards.id, asset: vaultCards.asset })
      .from(vaultCards)
      .where(inArray(vaultCards.asset, [...new Set(trades.map((t) => t.asset))]));
    const cardOf = new Map(cards.map((c) => [c.asset, c.id]));
    const mints = coinMints();
    const coinOf = (mint: string) => (Object.keys(mints) as Coin[]).find((c) => mints[c] === mint) ?? "usdt";
    const rows = trades.flatMap((t) => {
      const cardId = cardOf.get(t.asset);
      if (!cardId) return [];
      const { signature, kind, seller, buyer, at } = t;
      return [{ signature, cardId, kind, seller, buyer, coin: coinOf(t.paymentMint), priceCents: Math.round(t.priceUsdt * 100), feeCents: Math.round(t.feeUsdt * 100), tradedAt: at }];
    });
    if (rows.length) await db.insert(vaultTrades).values(rows).onConflictDoNothing();
  }
  if (newest && newest !== cursor?.signature) {
    await db
      .insert(chainCursors)
      .values({ key: CURSOR, signature: newest })
      .onConflictDoUpdate({ target: chainCursors.key, set: { signature: newest, updatedAt: new Date() } });
  }
}

export type PublicVaultTrade = {
  signature: string;
  role: "buyer" | "seller";
  auction: boolean;
  cardId: string;
  title: string;
  photo: string | null;
  priceUsdt: number;
  feeUsdt: number;
  coin: Coin;
  at: string;
};

// 這個錢包買到和賣出的金庫卡，新的在前
export async function myVaultTrades(db: Db, wallet: string): Promise<PublicVaultTrade[]> {
  const rows = await db
    .select({ trade: vaultTrades, card: vaultCards })
    .from(vaultTrades)
    .innerJoin(vaultCards, eq(vaultCards.id, vaultTrades.cardId))
    .where(or(eq(vaultTrades.seller, wallet), eq(vaultTrades.buyer, wallet)))
    .orderBy(desc(vaultTrades.tradedAt));
  return rows.map(({ trade, card }) => ({
    signature: trade.signature,
    role: trade.buyer === wallet ? "buyer" : "seller",
    auction: trade.kind === "auction",
    cardId: card.id,
    title: itemTitle({ title: null, group: card.groupName, member: card.member, version: card.version }),
    photo: card.imageFront,
    priceUsdt: trade.priceCents / 100,
    feeUsdt: trade.feeCents / 100,
    coin: trade.coin,
    at: trade.tradedAt.toISOString(),
  }));
}
