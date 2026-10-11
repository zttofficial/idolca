import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { refundOrder } from "@/lib/server/orders";

// 後台退款：全額退給買家，商品重新上架
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/orders/[id]/refund">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  try {
    const result = await refundOrder(a.db, (await ctx.params).id);
    if ("error" in result) return fail(result.error ?? "invalid_state", 409);
    return Response.json(result);
  } catch (err) {
    console.error("admin refund failed", err);
    return fail("chain_failed", 502);
  }
}
