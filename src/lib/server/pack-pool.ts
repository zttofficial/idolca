import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "./db";
import { packOrders } from "./schema";
import type { Pack, PoolEntry } from "@/lib/packs";

// 卡池的資料庫查詢，不碰鏈上依賴，頁面可以直接用。
// 剩餘張數 = 卡池總數 − 已開出的張數（pack_orders 裡的 pulls）
export type Pull = { entryId: string; cardId: string; asset: string; tx: string };

export async function livePool(db: Db, pack: Pack): Promise<PoolEntry[]> {
  const rows = await db.select({ pulls: packOrders.pulls }).from(packOrders).where(and(eq(packOrders.packId, pack.id), isNotNull(packOrders.pulls)));
  const drawn = new Map<string, number>();
  for (const r of rows) for (const p of JSON.parse(r.pulls!) as Pull[]) drawn.set(p.entryId, (drawn.get(p.entryId) ?? 0) + 1);
  return pack.pool.map((e) => ({ ...e, remaining: Math.max(0, e.remaining - (drawn.get(e.id) ?? 0)) }));
}

// 這個卡包最近真實開出的卡（所有人的），新的在前
export async function recentPackPulls(db: Db, pack: Pack, limit = 10) {
  const rows = await db
    .select({ wallet: packOrders.wallet, pulls: packOrders.pulls, at: packOrders.createdAt })
    .from(packOrders)
    .where(and(eq(packOrders.packId, pack.id), isNotNull(packOrders.pulls)))
    .orderBy(desc(packOrders.createdAt))
    .limit(limit);
  return rows
    .flatMap((r) =>
      (JSON.parse(r.pulls!) as Pull[]).flatMap((p) => {
        const entry = pack.pool.find((e) => e.id === p.entryId);
        return entry ? [{ wallet: r.wallet, entry, asset: p.asset, minutesAgo: Math.max(0, Math.round((Date.now() - r.at.getTime()) / 60_000)) }] : [];
      }),
    )
    .slice(0, limit);
}

// 卡池清單的 SHA-256：任何人都能用公開的卡池清單重算核對
export function poolCommitment(pack: Pack) {
  const list = pack.pool.map(({ id, cardId, version, tier, valueUsdt, total }) => ({ id, cardId, version, tier, valueUsdt, total }));
  return createHash("sha256").update(JSON.stringify(list)).digest("hex");
}
