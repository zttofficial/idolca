import { fail, requireUser } from "@/lib/server/require-user";
import { cancelUnshipped } from "@/lib/server/orders";

// 買家取消訂單：賣家過了寄出期限還沒寄，平台全額退款
export async function POST(_request: Request, ctx: RouteContext<"/api/orders/[id]/refund">) {
  const a = await requireUser();
  if (a.error) return a.error;
  try {
    const result = await cancelUnshipped(a.db, a.user.id, (await ctx.params).id);
    if ("error" in result) return fail(result.error ?? "not_refundable", 409);
    return Response.json(result);
  } catch (err) {
    console.error("refund failed", err);
    return fail("chain_failed", 502);
  }
}
