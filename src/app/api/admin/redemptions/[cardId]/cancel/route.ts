import { and, eq, isNull } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import { redemptions } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { cancelRedemption, readCardState } from "@/lib/server/vault-chain";
import { payout } from "@/lib/server/funds";

// 取消提貨（例如地址寄不到、持有人要求）：解凍並交還委託，已付的運費和稅退回持有人
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/redemptions/[cardId]/cancel">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { cardId } = await ctx.params;
  const [req] = await a.db
    .select()
    .from(redemptions)
    .where(and(eq(redemptions.cardId, cardId), isNull(redemptions.shipTx), isNull(redemptions.cancelledAt)));
  if (!req || !(await readCardState(cardId))?.redeeming) return Response.json({ error: "not_redeeming" }, { status: 409 });
  try {
    const cancelTx = await cancelRedemption(cardId);
    const paidCents = req.feeCents + req.taxCents;
    const refundTx = req.feePaid && paidCents > 0 ? await payout(new PublicKey(req.wallet), paidCents / 100, req.coin) : null;
    await a.db.update(redemptions).set({ cancelTx, refundTx, cancelledAt: new Date(), shippingAddress: null }).where(eq(redemptions.cardId, cardId));
    return Response.json({ cancelTx, refundTx });
  } catch (err) {
    console.error("cancel redemption failed", err);
    return Response.json({ error: "chain_failed" }, { status: 502 });
  }
}
