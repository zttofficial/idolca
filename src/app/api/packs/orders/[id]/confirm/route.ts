import { fail, requireUser } from "@/lib/server/require-user";
import { confirmPackOrder } from "@/lib/server/packs";
import { ArcPaymentError } from "@/lib/server/arc-pay";

// 開卡包第二步：回報付款，伺服器對帳、抽卡、把抽到的金庫卡轉進買家錢包，回傳抽到的卡。
// Solana 付款回報付款交易簽名；Arc 付款回報付款地址、授權有效期和授權簽名，伺服器代為送上鏈
export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/packs/orders/[id]/confirm">) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { signature?: string; from?: unknown; validBefore?: unknown };
  if (typeof body.signature !== "string") return fail("invalid_request");
  try {
    const result = await confirmPackOrder(a.db, a.user.id, (await ctx.params).id, { signature: body.signature, from: body.from, validBefore: body.validBefore });
    if ("error" in result) return fail(result.error ?? "payment_not_found", 409);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ArcPaymentError) return fail(err.message, 409);
    console.error("pack draw failed", err);
    return fail("chain_failed", 502);
  }
}
