import { fail, requireUser } from "@/lib/server/require-user";
import { confirmOrderPayment } from "@/lib/server/orders";
import { ArcPaymentError } from "@/lib/server/arc-pay";

// 買家回報付款，伺服器對帳。Solana 付款回報付款交易簽名；Arc 付款回報付款地址、授權有效期和授權簽名，伺服器代為送上鏈
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/confirm">) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { signature?: string; from?: unknown; validBefore?: unknown };
  if (typeof body.signature !== "string") return fail("invalid_request");
  try {
    const result = await confirmOrderPayment(a.db, a.user.id, (await ctx.params).id, { signature: body.signature, from: body.from, validBefore: body.validBefore });
    if ("error" in result) return fail(result.error ?? "payment_not_found", 409);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ArcPaymentError) return fail(err.message, 409);
    throw err;
  }
}
