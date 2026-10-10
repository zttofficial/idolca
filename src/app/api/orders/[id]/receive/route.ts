import { fail, requireUser } from "@/lib/server/require-user";
import { confirmReceived } from "@/lib/server/orders";

// 買家確認收貨：平台放款給賣家並把 NFT 轉給買家
export async function POST(_request: Request, ctx: RouteContext<"/api/orders/[id]/receive">) {
  const a = await requireUser();
  if (a.error) return a.error;
  try {
    const result = await confirmReceived(a.db, a.user.id, (await ctx.params).id);
    if ("error" in result) return fail(result.error ?? "not_shipped", 409);
    return Response.json(result);
  } catch (err) {
    console.error("receive failed", err);
    return fail("chain_failed", 502);
  }
}
