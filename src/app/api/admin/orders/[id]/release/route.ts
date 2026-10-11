import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { releaseOrder } from "@/lib/server/orders";

// 後台放款：NFT 轉給買家、貨款放給賣家
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/orders/[id]/release">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  try {
    const result = await releaseOrder(a.db, (await ctx.params).id);
    if ("error" in result) return fail(result.error ?? "invalid_state", 409);
    return Response.json(result);
  } catch (err) {
    console.error("admin release failed", err);
    return fail("chain_failed", 502);
  }
}
