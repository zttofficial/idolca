import { after } from "next/server";
import { fail, requireUser } from "@/lib/server/require-user";
import { confirmBid, refundBids } from "@/lib/server/auctions";
import { ArcPaymentError } from "@/lib/server/arc-pay";

// 出價者回報付款，伺服器對帳後嘗試成為最高出價。被超過的前一口、或這一口沒被接受（截止、被搶先）時，回應後退款
export async function POST(request: Request, ctx: RouteContext<"/api/bids/[id]/confirm">) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { signature?: string; from?: unknown; validBefore?: unknown };
  if (typeof body.signature !== "string") return fail("invalid_request");
  try {
    const result = await confirmBid(a.db, a.user.id, (await ctx.params).id, { signature: body.signature, from: body.from, validBefore: body.validBefore });
    after(() => refundBids(a.db));
    if ("error" in result) return fail(result.error ?? "payment_not_found", 409);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ArcPaymentError) return fail(err.message, 409);
    throw err;
  }
}
