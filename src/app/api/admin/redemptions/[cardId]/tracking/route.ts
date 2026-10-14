import { and, eq, isNotNull } from "drizzle-orm";
import { connection } from "next/server";
import { redemptions } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { notifyRedeemShipped } from "@/lib/server/redemption-tracking";
import { parseTracking } from "@/lib/tracking";

// 更正已出貨提貨的物流單號（打錯、換了寄法），改了就再通知申請人一次
export async function POST(request: Request, ctx: RouteContext<"/api/admin/redemptions/[cardId]/tracking">) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { cardId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { tracking?: unknown };
  const tracking = parseTracking(body.tracking);
  if (!tracking) return Response.json({ error: "invalid_tracking" }, { status: 400 });
  const [before] = await a.db.select().from(redemptions).where(eq(redemptions.cardId, cardId));
  if (!before?.shipTx) return Response.json({ error: "not_shipped" }, { status: 409 });
  if (before.trackingCarrier === tracking.carrier && before.trackingNumber === tracking.number) return Response.json({ ok: true });
  const [row] = await a.db
    .update(redemptions)
    .set({ trackingCarrier: tracking.carrier, trackingNumber: tracking.number })
    .where(and(eq(redemptions.cardId, cardId), isNotNull(redemptions.shipTx)))
    .returning();
  if (row) await notifyRedeemShipped(a.db, row, tracking.number, String(Date.now()));
  return Response.json({ ok: true });
}
