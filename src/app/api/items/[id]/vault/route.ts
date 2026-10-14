import { and, eq, inArray, isNull } from "drizzle-orm";
import { fail, requireWalletUser } from "@/lib/server/require-user";
import { collectorItems, orders } from "@/lib/server/schema";
import { publicItem } from "@/lib/server/items";
import { liveAuction } from "@/lib/server/auctions";
import { isVaultId } from "@/lib/vaults";

// 申請把自己上鏈的卡寄進金庫（body.vault 選寄到哪個金庫）：下架、等實物寄到，鑑定為真後轉成金庫卡（金庫 NFT 鑄到綁定的錢包，所以要有錢包）。
// DELETE 取消申請（實物還沒被收下之前）
export async function POST(request: Request, ctx: RouteContext<"/api/items/[id]/vault">) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  const { id } = await ctx.params;
  const { vault } = (await request.json().catch(() => ({}))) as { vault?: unknown };
  if (!isVaultId(vault)) return fail("invalid_vault");
  const open = await a.db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.itemId, id), inArray(orders.status, ["pending", "paid", "shipped", "disputed", "refunding", "releasing"])));
  if (open.length) return fail("in_order", 409);
  if (await liveAuction(a.db, id)) return fail("in_auction", 409);
  const [row] = await a.db
    .update(collectorItems)
    .set({ vaultRequestedAt: new Date(), vaultTarget: vault, priceCents: null, listedAt: null })
    .where(
      and(
        eq(collectorItems.id, id),
        eq(collectorItems.userId, a.user.id),
        eq(collectorItems.verification, "unverified"),
        isNull(collectorItems.vaultRequestedAt),
        isNull(collectorItems.vaultCardId),
      ),
    )
    .returning();
  if (!row) return fail("not_allowed", 409);
  return Response.json({ item: publicItem(row) });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/items/[id]/vault">) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  const [row] = await a.db
    .update(collectorItems)
    .set({ vaultRequestedAt: null, vaultTarget: null })
    .where(and(eq(collectorItems.id, (await ctx.params).id), eq(collectorItems.userId, a.user.id), isNull(collectorItems.vaultCardId)))
    .returning();
  if (!row) return fail("not_found", 404);
  return Response.json({ item: publicItem(row) });
}
