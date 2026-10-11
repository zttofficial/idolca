import { and, eq, isNull } from "drizzle-orm";
import { redemptions } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { shipRedemption, vaultState } from "@/lib/server/vault-chain";
import { markBurned } from "@/lib/server/vault-cards";

// 平台寄出實物：在同一筆交易裡解凍並銷毀 NFT
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/redemptions/[cardId]/ship">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { cardId } = await ctx.params;
  if (!(await vaultState())[cardId]?.redeeming) return Response.json({ error: "not_redeeming" }, { status: 409 });
  const [req] = await a.db.select().from(redemptions).where(and(eq(redemptions.cardId, cardId), isNull(redemptions.cancelledAt)));
  if (!req?.shippingAddress) return Response.json({ error: "no_address" }, { status: 409 });
  if (!req.feePaid) return Response.json({ error: "fee_unpaid" }, { status: 409 });
  try {
    const shipTx = await shipRedemption(cardId);
    await a.db.update(redemptions).set({ shipTx, shippedAt: new Date() }).where(eq(redemptions.cardId, cardId));
    await markBurned(a.db, cardId);
    return Response.json({ shipTx });
  } catch (err) {
    console.error("ship failed", err);
    return Response.json({ error: "chain_failed" }, { status: 502 });
  }
}
