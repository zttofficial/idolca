import { fail, requireUser } from "@/lib/server/require-user";
import { confirmPackOrder } from "@/lib/server/packs";

// 開卡包第二步：付款交易送出後回報簽名，伺服器對帳、抽卡、鑄造，回傳抽到的卡和 NFT
export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/packs/orders/[id]/confirm">) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { signature?: string };
  if (typeof body.signature !== "string") return fail("invalid_request");
  try {
    const result = await confirmPackOrder(a.db, a.user.id, (await ctx.params).id, body.signature);
    if ("error" in result) return fail(result.error ?? "payment_not_found", 409);
    return Response.json(result);
  } catch (err) {
    console.error("pack mint failed", err);
    return fail("chain_failed", 502);
  }
}
