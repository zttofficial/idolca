import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "./db";
import { feeRules } from "./schema";
import { FEE_KINDS, FEE_MAX, defaultFees, resolveFees, type FeeKind, type FeeRule, type Fees } from "@/lib/fees";

// 手續費規則的讀寫。費率在建單、開拍、組鑄造交易時讀（見 src/lib/fees.ts 的規則）；同一實例快取 30 秒，後台改了規則就清掉

const CACHE_MS = 30_000;
let cache: { at: number; rules: FeeRule[] } | null = null;

const toRule = (r: typeof feeRules.$inferSelect): FeeRule => ({
  id: r.id,
  kind: r.kind,
  value: r.value,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  label: r.label,
});

// 還有用的規則：所有基本費率（決定現在和以後的費率），加上還沒結束的促銷
async function activeRules(db: Db) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules;
  const rows = await db
    .select()
    .from(feeRules)
    .where(or(isNull(feeRules.endsAt), gt(feeRules.endsAt, new Date())))
    .orderBy(asc(feeRules.startsAt));
  const rules = rows.map(toRule);
  cache = { at: Date.now(), rules };
  return rules;
}

export async function getFees(db: Db | null, now = new Date()): Promise<Fees> {
  if (!db) return defaultFees();
  return resolveFees(await activeRules(db), now);
}

// 後台列表：全部規則，含已結束的促銷
export async function listFeeRules(db: Db) {
  const rows = await db.select().from(feeRules).orderBy(asc(feeRules.kind), asc(feeRules.startsAt));
  return rows.map((r) => ({ ...toRule(r), createdAt: r.createdAt }));
}

export type FeeRuleInput = {
  kind: unknown;
  value: unknown;
  startsAt: unknown;
  endsAt?: unknown;
  label?: unknown;
};

// 檢查並新增一條規則。startsAt 留空表示立即生效；促銷要有結束時間，而且結束在開始之後、還沒過去
export async function addFeeRule(db: Db, input: FeeRuleInput, userId: string) {
  const kind = input.kind as FeeKind;
  if (!(FEE_KINDS as readonly string[]).includes(kind)) return { error: "invalid_kind" as const };
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 0 || value > FEE_MAX[kind]) return { error: "invalid_value" as const };
  const now = new Date();
  const startsAt = input.startsAt ? new Date(String(input.startsAt)) : now;
  const endsAt = input.endsAt ? new Date(String(input.endsAt)) : null;
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) return { error: "invalid_time" as const };
  if (endsAt && (endsAt <= startsAt || endsAt <= now)) return { error: "invalid_time" as const };
  // 基本費率不能追溯：開始時間早於現在的一律從現在開始
  const start = startsAt < now ? now : startsAt;
  const label = typeof input.label === "string" && input.label.trim() ? input.label.trim().slice(0, 60) : null;
  const row = {
    id: randomUUID(),
    kind,
    value,
    startsAt: start,
    endsAt,
    label: endsAt ? label : null,
    createdBy: userId,
  };
  await db.insert(feeRules).values(row);
  cache = null;
  return { rule: toRule({ ...row, createdAt: now }) };
}

// 還沒開始的規則直接刪除；進行中的促銷提前結束（記錄留著）。已生效的基本費率不能刪，要改就排一條新的
export async function removeFeeRule(db: Db, id: string) {
  const [row] = await db.select().from(feeRules).where(eq(feeRules.id, id));
  if (!row) return { error: "not_found" as const };
  const now = new Date();
  if (row.startsAt > now) await db.delete(feeRules).where(eq(feeRules.id, id));
  else if (row.endsAt && row.endsAt > now)
    await db
      .update(feeRules)
      .set({ endsAt: now })
      .where(and(eq(feeRules.id, id), gt(feeRules.endsAt, now)));
  else return { error: "not_allowed" as const };
  cache = null;
  return { ok: true as const };
}
