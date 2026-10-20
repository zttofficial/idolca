import { and, eq, isNull } from "drizzle-orm";
import { connection } from "next/server";
import { redemptions } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { readCardState, shipRedemption } from "@/lib/server/vault-chain";
import { markBurned } from "@/lib/server/vault-cards";
import { notifyRedeemShipped } from "@/lib/server/redemption-tracking";
import { parseTracking } from "@/lib/tracking";

// 平台寄出實物：要填物流單號（物流商選填），在同一筆交易裡解凍並銷毀 NFT，單號和出貨交易一起記下，再通知申請人
export async function POST(request: Request, ctx: RouteContext<"/api/admin/redemptions/[cardId]/ship">) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { cardId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { tracking?: unknown };
  const tracking = parseTracking(body.tracking);
  if (!tracking) return Response.json({ error: "invalid_tracking" }, { status: 400 });
  if (!(await readCardState(cardId))?.redeeming) return Response.json({ error: "not_redeeming" }, { status: 409 });
  const [req] = await a.db
    .select()
    .from(redemptions)
    .where(and(eq(redemptions.cardId, cardId), isNull(redemptions.cancelledAt)));
  if (!req?.shippingAddress) return Response.json({ error: "no_address" }, { status: 409 });
  if (!req.feePaid) return Response.json({ error: "fee_unpaid" }, { status: 409 });
  try {
    const shipTx = await shipRedemption(cardId);
    await a.db.update(redemptions).set({ shipTx, shippedAt: new Date(), trackingCarrier: tracking.carrier, trackingNumber: tracking.number }).where(eq(redemptions.cardId, cardId));
    await markBurned(a.db, cardId);
    await notifyRedeemShipped(a.db, req, tracking.number);
    return Response.json({ shipTx });
  } catch (err) {
    console.error("ship failed", err);
    return Response.json({ error: "chain_failed" }, { status: 502 });
  }
}
