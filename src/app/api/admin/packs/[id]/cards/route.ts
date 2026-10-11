import { and, eq, isNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { vaultCards } from "@/lib/server/schema";
import { getPackRow } from "@/lib/server/pack-pool";
import { invalidateVaultCards } from "@/lib/server/vault-cards";
import { TIERS, type Tier } from "@/lib/packs";

// 把一張平台自有的金庫卡放進卡池（等級、價值），或從卡池拿出來（已被抽走的不能拿）
export async function POST(request: Request, ctx: RouteContext<"/api/admin/packs/[id]/cards">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const packId = (await ctx.params).id;
  if (!(await getPackRow(a.db, packId))) return fail("not_found", 404);
  const body = (await request.json().catch(() => ({}))) as { cardId?: string; tier?: string; valueUsdt?: number };
  const value = Number(body.valueUsdt);
  if (typeof body.cardId !== "string" || !TIERS.includes(body.tier as Tier)) return fail("invalid_request");
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return fail("invalid_value");
  const [row] = await a.db
    .update(vaultCards)
    .set({ packId, packTier: body.tier, packValueCents: Math.round(value * 100), packOrder: null })
    .where(and(eq(vaultCards.id, body.cardId), isNull(vaultCards.packId), isNull(vaultCards.depositorId), isNull(vaultCards.burnedAt)))
    .returning();
  if (!row) return fail("not_assignable", 409);
  invalidateVaultCards();
  return Response.json({ ok: true });
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
