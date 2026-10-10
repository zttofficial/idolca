import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Db } from "./db";
import { packOrders } from "./schema";
import { buildBuybackTx, buildPayment, mintPackCard, verifyPayment } from "./funds";
import { confirmSignature } from "./vault-chain";
import { BUYBACK_RATE, PACKS, drawFromPool, entryCard, type Pack, type PoolEntry } from "@/lib/packs";

// 開卡包：付款進平台錢包 → 對帳 → 從卡池抽卡 → 每張抽到的卡在金庫集合鑄成 NFT 給買家。
// 卡池剩餘張數 = 展示資料的剩餘張數 − 已開出的張數（記在 pack_orders）
const memoOf = (orderId: string) => `idolca:pack:${orderId}`;
export const MAX_QTY = 10;

type Pull = { entryId: string; cardId: string; asset: string; tx: string };

export async function livePool(db: Db, pack: Pack): Promise<PoolEntry[]> {
  const rows = await db.select({ pulls: packOrders.pulls }).from(packOrders).where(and(eq(packOrders.packId, pack.id), isNotNull(packOrders.pulls)));
  const drawn = new Map<string, number>();
  for (const r of rows) for (const p of JSON.parse(r.pulls!) as Pull[]) drawn.set(p.entryId, (drawn.get(p.entryId) ?? 0) + 1);
  return pack.pool.map((e) => ({ ...e, remaining: Math.max(0, e.remaining - (drawn.get(e.id) ?? 0)) }));
}

export async function createPackOrder(db: Db, userId: string, wallet: string, packId: string, qty: number) {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) return { error: "not_found" as const };
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: "invalid_qty" as const };
  const left = (await livePool(db, pack)).reduce((n, e) => n + e.remaining, 0);
  if (left < qty) return { error: "sold_out" as const };
  const id = randomUUID();
  const amountCents = Math.round(pack.priceUsdt * 100) * qty;
  await db.insert(packOrders).values({ id, userId, packId, qty, amountCents, wallet });
  return { id, amountUsdt: amountCents / 100, tx: await buildPayment(new PublicKey(wallet), amountCents / 100, memoOf(id)) };
}

// 付款確認後抽卡並鑄造。同一筆訂單只會抽一次（pay_tx 唯一、pulls 寫入後不再處理）
export async function confirmPackOrder(db: Db, userId: string, orderId: string, signature: string) {
  const [order] = await db.select().from(packOrders).where(and(eq(packOrders.id, orderId), eq(packOrders.userId, userId)));
  if (!order) return { error: "not_found" as const };
  if (order.pulls) return { pulls: JSON.parse(order.pulls) as Pull[] };
  const ok = await verifyPayment(signature, new PublicKey(order.wallet), order.amountCents / 100, memoOf(orderId));
  if (!ok) return { error: "payment_not_found" as const };
  await db.update(packOrders).set({ payTx: signature }).where(eq(packOrders.id, orderId));

  const pack = PACKS.find((p) => p.id === order.packId)!;
  const drawn = drawFromPool(await livePool(db, pack), order.qty, () => randomInt(2 ** 32) / 2 ** 32);
  const pulls: Pull[] = [];
  for (const entry of drawn) {
    const card = entryCard(entry);
    const serial = `IC-P${orderId.slice(0, 4).toUpperCase()}${pulls.length}`;
    const minted = await mintPackCard(order.wallet, { ...card, id: entry.cardId, serial });
    pulls.push({ entryId: entry.id, cardId: entry.cardId, asset: minted.asset, tx: minted.tx });
  }
  await db.update(packOrders).set({ pulls: JSON.stringify(pulls) }).where(eq(packOrders.id, orderId));
  return { pulls };
}

// 即時回購：持有人把抽到的卡賣回平台，按卡值的 BUYBACK_RATE 付款。
// 一筆交易裡同時做兩件事：持有人簽名把 NFT 轉給平台、平台把 USDT 轉給持有人，任何一步失敗整筆作廢
export async function buildBuyback(db: Db, userId: string, wallet: string, asset: string) {
  const rows = await db.select().from(packOrders).where(and(eq(packOrders.userId, userId), isNotNull(packOrders.pulls)));
  for (const r of rows) {
    const pull = (JSON.parse(r.pulls!) as (Pull & { buybackTx?: string })[]).find((p) => p.asset === asset);
    if (!pull) continue;
    if (pull.buybackTx) return { error: "already_sold" as const };
    const entry = PACKS.find((p) => p.id === r.packId)?.pool.find((e) => e.id === pull.entryId);
    if (!entry) return { error: "not_found" as const };
    const amount = Math.round(entry.valueUsdt * BUYBACK_RATE * 100) / 100;
    return { amountUsdt: amount, tx: await buildBuybackTx(new PublicKey(wallet), asset, amount) };
  }
  return { error: "not_found" as const };
}

export async function confirmBuyback(db: Db, userId: string, asset: string, signature: string) {
  await confirmSignature(signature);
  const rows = await db.select().from(packOrders).where(and(eq(packOrders.userId, userId), isNotNull(packOrders.pulls)));
  for (const r of rows) {
    const pulls = JSON.parse(r.pulls!) as (Pull & { buybackTx?: string })[];
    const pull = pulls.find((p) => p.asset === asset);
    if (!pull) continue;
    pull.buybackTx = signature;
    await db.update(packOrders).set({ pulls: JSON.stringify(pulls) }).where(eq(packOrders.id, r.id));
    return { ok: true as const };
  }
  return { error: "not_found" as const };
}
