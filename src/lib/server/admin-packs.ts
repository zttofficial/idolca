import "server-only";
import { and, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import { packs, vaultCards } from "./schema";
import { afterCursor, containsAny, cursorOf, orderOf, page, type ListParams, type SortKey } from "./admin-lists";
import { likePrefix } from "@/lib/admin-list";
import { MAX_RTP, TIERS, overRtp, type Tier } from "@/lib/packs";

// 後台的卡包：列表每頁只帶統計（卡池在資料庫裡按等級加總，不把整個卡池傳出去），卡池另外分頁讀。
// 統計的算法同 packStats（src/lib/packs.ts）
export const PACK_VIEWS = ["all", "live", "upcoming", "ended"] as const;
// 快賣完：正在賣、剩下不到 LOW_STOCK 張或總數的一成
const LOW_STOCK = 5;

type TierCount = { tier: Tier; total: number; remaining: number };
export type AdminPack = {
  id: string;
  name: string;
  priceUsdt: number;
  maxQty: number;
  startsAt: string;
  endsAt: string;
  palette: [string, string];
  seedHash: string;
  status: "live" | "upcoming" | "ended";
  total: number;
  remaining: number;
  tiers: TierCount[];
  expected: number;
  rtp: number;
  sellOutRtp: number;
  sellOutProfit: number;
  paused: boolean;
  lowStock: boolean;
};

const statusSql = sql`(CASE WHEN ${packs.startsAt} > now() THEN 1 WHEN ${packs.endsAt} <= now() THEN 2 ELSE 0 END)`;

// 一頁卡包的卡池按等級加總：一次 GROUP BY，和卡池大小無關的傳輸量
async function withStats(db: Db, rows: (typeof packs.$inferSelect)[]): Promise<AdminPack[]> {
  if (!rows.length) return [];
  const agg = await db
    .select({
      packId: vaultCards.packId,
      tier: vaultCards.packTier,
      total: sql<number>`count(*)::int`,
      remaining: sql<number>`(count(*) FILTER (WHERE ${vaultCards.packOrder} IS NULL))::int`,
      value: sql<number>`coalesce(sum(${vaultCards.packValueCents}), 0)::float8`,
      remainingValue: sql<number>`coalesce(sum(${vaultCards.packValueCents}) FILTER (WHERE ${vaultCards.packOrder} IS NULL), 0)::float8`,
    })
    .from(vaultCards)
    .where(
      and(
        inArray(
          vaultCards.packId,
          rows.map((r) => r.id),
        ),
        isNull(vaultCards.burnedAt),
      ),
    )
    .groupBy(vaultCards.packId, vaultCards.packTier);
  const now = Date.now();
  return rows.map((p) => {
    const mine = agg.filter((a) => a.packId === p.id);
    const sum = (k: "total" | "remaining" | "value" | "remainingValue") => mine.reduce((n, a) => n + Number(a[k]), 0);
    const price = p.priceCents / 100;
    const total = sum("total");
    const remaining = sum("remaining");
    const expected = remaining ? sum("remainingValue") / 100 / remaining : 0;
    const poolValue = sum("value") / 100;
    const status = p.startsAt.getTime() > now ? "upcoming" : p.endsAt.getTime() <= now ? "ended" : "live";
    return {
      id: p.id,
      name: p.name,
      priceUsdt: price,
      maxQty: p.maxQty,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      palette: JSON.parse(p.palette) as [string, string],
      seedHash: p.seedHash,
      status,
      total,
      remaining,
      tiers: TIERS.map((tier) => {
        const a = mine.find((x) => (x.tier ?? "N") === tier);
        return { tier, total: Number(a?.total ?? 0), remaining: Number(a?.remaining ?? 0) };
      }),
      expected,
      rtp: price ? expected / price : 0,
      sellOutRtp: total && price ? poolValue / (total * price) : 0,
      sellOutProfit: total * price - poolValue,
      paused: remaining > 0 && overRtp(expected, price),
      lowStock: status === "live" && total > 0 && remaining <= Math.max(LOW_STOCK, Math.floor(total / 10)),
    };
  });
}

// 卡包列表：all 是正在賣的在前、其次即將開賣、已結束的最後，同一類裡新開賣的在前
export async function adminPacks(db: Db, p: ListParams) {
  const view = p.pick("status", PACK_VIEWS, "all");
  const keys: SortKey[] = [
    ...(view === "all" ? [{ expr: statusSql, type: "int" as const }] : []),
    { expr: packs.startsAt, type: "timestamptz", desc: true },
    { expr: packs.id, type: "text", desc: true },
  ];
  const q = p.q;
  const where = p.id
    ? eq(packs.id, p.id)
    : and(
        view === "live"
          ? and(lte(packs.startsAt, sql`now()`), gt(packs.endsAt, sql`now()`))
          : view === "upcoming"
            ? gt(packs.startsAt, sql`now()`)
            : view === "ended"
              ? lte(packs.endsAt, sql`now()`)
              : undefined,
        p.from ? gte(packs.startsAt, p.from) : undefined,
        p.to ? lt(packs.startsAt, p.to) : undefined,
        q ? or(ilike(packs.id, likePrefix(q)), containsAny(q, [packs.name])) : undefined,
        afterCursor(keys, p.cursor),
      );
  const rows = await db
    .select({ pack: packs, cursor: cursorOf(keys) })
    .from(packs)
    .where(where)
    .orderBy(...orderOf(keys))
    .limit(p.limit + 1);
  const { list, next } = page(rows, p.limit);
  return {
    rows: await withStats(
      db,
      list.map((r) => r.pack),
    ),
    next,
    maxRtp: MAX_RTP,
  };
}

// 待處理：正在賣和 7 天內開賣的卡包（數量本來就少，最多看 50 個），挑出快賣完、暫停販售的
export async function adminPackQueue(db: Db) {
  const rows = await db
    .select()
    .from(packs)
    .where(and(gt(packs.endsAt, sql`now()`), lte(packs.startsAt, sql`now() + interval '7 days'`)))
    .orderBy(packs.startsAt)
    .limit(50);
  const list = await withStats(db, rows);
  return {
    live: list.filter((p) => p.status === "live"),
    upcoming: list.filter((p) => p.status === "upcoming"),
  };
}

// 卡池分頁：按編號排（同抽卡時的順序），可以搜編號、團體、成員，篩等級和是否已被抽走
export const POOL_STATES = ["", "remaining", "pulled"] as const;
export async function adminPackPool(db: Db, packId: string, p: ListParams) {
  const state = p.pick("state", POOL_STATES, "");
  const tier = p.pick("tier", ["", ...TIERS], "");
  const keys: SortKey[] = [
    { expr: vaultCards.serial, type: "text" },
    { expr: vaultCards.id, type: "text" },
  ];
  const q = p.q;
  const rows = await db
    .select({ card: vaultCards, cursor: cursorOf(keys) })
    .from(vaultCards)
    .where(
      and(
        eq(vaultCards.packId, packId),
        isNull(vaultCards.burnedAt),
        state === "remaining" ? isNull(vaultCards.packOrder) : state === "pulled" ? isNotNull(vaultCards.packOrder) : undefined,
        tier ? eq(vaultCards.packTier, tier) : undefined,
        q ? or(ilike(vaultCards.serial, likePrefix(q)), containsAny(q, [vaultCards.groupName, vaultCards.member, vaultCards.version])) : undefined,
        afterCursor(keys, p.cursor),
      ),
    )
    .orderBy(...orderOf(keys))
    .limit(p.limit + 1);
  const { list, next } = page(rows, p.limit);
  return {
    rows: list.map(({ card: c }) => ({
      id: c.id,
      serial: c.serial,
      group: c.groupName,
      member: c.member,
      version: c.version,
      tier: (c.packTier ?? "N") as Tier,
      valueUsdt: (c.packValueCents ?? 0) / 100,
      pulled: Boolean(c.packOrder),
    })),
    next,
  };
}
export type AdminPoolEntry = Awaited<ReturnType<typeof adminPackPool>>["rows"][number];
