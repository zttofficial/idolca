import { and, eq, exists, inArray, isNull } from "drizzle-orm";
import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { vaultCards, vaultChainState } from "@/lib/server/schema";
import { getPackRow } from "@/lib/server/pack-pool";
import { invalidateVaultCards } from "@/lib/server/vault-cards";
import { listParams } from "@/lib/server/admin-lists";
import { adminPackPool } from "@/lib/server/admin-packs";
import { CHAIN } from "@/lib/chain";
import { TIERS, type Tier } from "@/lib/packs";

// 卡池分頁（按編號排，可以搜編號、團體、成員，篩等級、是否已被抽走）
export async function GET(request: NextRequest, ctx: RouteContext<"/api/admin/packs/[id]/cards">) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  return Response.json(await adminPackPool(a.db, (await ctx.params).id, listParams(request.nextUrl.searchParams)));
}

// 一次最多放幾張
const MAX_ADD = 100;

// 把平台自有的金庫卡放進卡池（同一個等級和價值，可以一次選多張），或從卡池拿出來（已被抽走的不能拿）。
// 只放得進能抽的卡：沒有寄存人、沒銷毀、不在別的卡包，鏈上狀態索引顯示在平台錢包、沒掛單、沒拍賣、沒在提貨（還沒同步的卡不放）
export async function POST(request: Request, ctx: RouteContext<"/api/admin/packs/[id]/cards">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const packId = (await ctx.params).id;
  if (!(await getPackRow(a.db, packId))) return fail("not_found", 404);
  const body = (await request.json().catch(() => ({}))) as { cardId?: unknown; cardIds?: unknown; tier?: string; valueUsdt?: number };
  const ids = Array.isArray(body.cardIds) ? body.cardIds : [body.cardId];
  const value = Number(body.valueUsdt);
  if (!ids.length || ids.length > MAX_ADD || !ids.every((x) => typeof x === "string") || !TIERS.includes(body.tier as Tier)) return fail("invalid_request");
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return fail("invalid_value");
  const onPlatform = a.db
    .select({ id: vaultChainState.cardId })
    .from(vaultChainState)
    .where(
      and(
        eq(vaultChainState.cardId, vaultCards.id),
        eq(vaultChainState.owner, CHAIN.platform),
        isNull(vaultChainState.listingSeller),
        isNull(vaultChainState.auctionSeller),
        eq(vaultChainState.redeeming, false),
        eq(vaultChainState.burned, false),
      ),
    );
  const rows = await a.db
    .update(vaultCards)
    .set({ packId, packTier: body.tier, packValueCents: Math.round(value * 100), packOrder: null })
    .where(and(inArray(vaultCards.id, ids as string[]), isNull(vaultCards.packId), isNull(vaultCards.depositorId), isNull(vaultCards.burnedAt), exists(onPlatform)))
    .returning({ id: vaultCards.id });
  if (!rows.length) return fail("not_assignable", 409);
  invalidateVaultCards();
  return Response.json({ ok: true, added: rows.map((r) => r.id) });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/packs/[id]/cards">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const packId = (await ctx.params).id;
  const body = (await request.json().catch(() => ({}))) as { cardId?: string };
  if (typeof body.cardId !== "string") return fail("invalid_request");
  const [row] = await a.db
    .update(vaultCards)
    .set({ packId: null, packTier: null, packValueCents: null })
    .where(and(eq(vaultCards.id, body.cardId), eq(vaultCards.packId, packId), isNull(vaultCards.packOrder)))
    .returning();
  if (!row) return fail("not_removable", 409);
  invalidateVaultCards();
  return Response.json({ ok: true });
}
