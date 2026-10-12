import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "./db";
import { packPulls, packs, users, vaultCards, packOrders } from "./schema";
import { toCard } from "./vault-cards";
import type { Pack, PoolEntry, Tier } from "@/lib/packs";

// 卡包和卡池的資料庫查詢，不碰鏈上依賴，頁面可以直接用。
// 卡池 = pack_id 是這個卡包、還沒提貨銷毀的金庫卡；pack_order 為空的還在卡池裡
type PackRow = typeof packs.$inferSelect;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// 種子在卡包結束或抽完後公開
const seedVisible = (p: PackRow, remaining: number) => Date.now() >= p.endsAt.getTime() || remaining === 0;

async function withPool(db: Db, p: PackRow): Promise<Pack> {
  const rows = await db
    .select()
    .from(vaultCards)
    .where(and(eq(vaultCards.packId, p.id), isNull(vaultCards.burnedAt)));
  const pool: PoolEntry[] = rows.map((r) => ({
    id: r.id,
    card: toCard(r),
    tier: (r.packTier ?? "N") as Tier,
    valueUsdt: (r.packValueCents ?? 0) / 100,
    total: 1,
    remaining: r.packOrder ? 0 : 1,
  }));
  const remaining = pool.reduce((n, e) => n + e.remaining, 0);
  return {
    id: p.id,
    name: p.name,
    priceUsdt: p.priceCents / 100,
    maxQty: p.maxQty,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    palette: JSON.parse(p.palette) as [string, string],
    seedHash: p.seedHash,
    seed: seedVisible(p, remaining) ? p.seed : null,
    pool,
  };
}

// 所有卡包，正在賣的排前面，其次是即將開賣，已結束的最後
export async function listPacks(db: Db): Promise<Pack[]> {
  const rows = await db.select().from(packs).orderBy(desc(packs.startsAt));
  const now = Date.now();
  const rank = (p: PackRow) => (p.startsAt.getTime() <= now && now < p.endsAt.getTime() ? 0 : p.startsAt.getTime() > now ? 1 : 2);
  const list = await Promise.all(rows.sort((a, b) => rank(a) - rank(b)).map((p) => withPool(db, p)));
  return list;
}

export async function getPack(db: Db, id: string) {
  const [row] = await db.select().from(packs).where(eq(packs.id, id));
  return row ? withPool(db, row) : null;
}

export async function getPackRow(db: Db, id: string) {
  const [row] = await db.select().from(packs).where(eq(packs.id, id));
  return row ?? null;
}

// 這個卡包最近真實開出的卡（所有人的），新的在前
export async function recentPackPulls(db: Db, pack: Pack, limit = 10) {
  const rows = await db
    .select({ pull: packPulls, wallet: packOrders.wallet })
    .from(packPulls)
    .innerJoin(packOrders, eq(packOrders.id, packPulls.orderId))
    .where(eq(packPulls.packId, pack.id))
    .orderBy(desc(packPulls.createdAt))
    .limit(limit);
  const now = Date.now();
  return rows.flatMap(({ pull, wallet }) => {
    const entry = pack.pool.find((e) => e.id === pull.cardId);
    return entry ? [{ wallet, entry, tx: pull.transferTx, minutesAgo: Math.max(0, Math.round((now - pull.createdAt.getTime()) / 60_000)) }] : [];
  });
}

// 每一抽的公開紀錄，用來核對公平性：付款通道和付款交易、付款證明（見 pack-draw.ts）、序號、當時卡池大小、抽中的位置、隨機數
export async function packDraws(db: Db, packId: string) {
  const rows = await db
    .select({ pull: packPulls, rail: packOrders.rail, payTx: packOrders.payTx, payProof: packOrders.payProof, serial: vaultCards.serial })
    .from(packPulls)
    .innerJoin(packOrders, eq(packOrders.id, packPulls.orderId))
    .innerJoin(vaultCards, eq(vaultCards.id, packPulls.cardId))
    .where(eq(packPulls.packId, packId))
    .orderBy(packPulls.createdAt, packPulls.idx);
  return rows.map(({ pull, rail, payTx, payProof, serial }) => ({ rail, payTx, proof: payProof ?? payTx ?? "", idx: pull.idx, poolSize: pull.poolSize, pick: pull.pick, r: pull.r, serial, at: pull.createdAt.toISOString() }));
}

// 我開卡包抽到、還沒賣回的卡
export async function myPackPulls(db: Db, userId: string) {
  return db
    .select({ cardId: packPulls.cardId, packId: packPulls.packId, tx: packPulls.transferTx, at: packPulls.createdAt })
    .from(packPulls)
    .innerJoin(packOrders, eq(packOrders.id, packPulls.orderId))
    .innerJoin(users, eq(users.id, packOrders.userId))
    .where(and(eq(packOrders.userId, userId), isNull(packPulls.buybackTx)))
    .orderBy(desc(packPulls.createdAt));
}

// 首頁推的卡包：正在賣、還有卡的第一個；都賣完了就推最近開賣的那個（顯示已售罄），還沒開賣的不推
export async function featuredPack(db: Db) {
  const now = Date.now();
  const started = (await listPacks(db)).filter((p) => Date.parse(p.startsAt) <= now && p.pool.length > 0);
  const live = started.find((p) => now < Date.parse(p.endsAt) && p.pool.some((e) => e.remaining > 0));
  return live ?? started.sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0] ?? null;
}
