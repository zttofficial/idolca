import { fail, requireWalletUser } from "@/lib/server/require-user";
import { createPackOrder } from "@/lib/server/packs";
import { marketReady } from "@/lib/server/vault-chain";

// 開卡包第一步：建訂單、回傳要錢包簽名的付款交易
export async function POST(request: Request, ctx: RouteContext<"/api/packs/[id]/order">) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  const body = (await request.json().catch(() => ({}))) as { qty?: number };
  const result = await createPackOrder(a.db, a.user.id, a.wallet, (await ctx.params).id, Number(body.qty));
  if ("error" in result) return fail(result.error ?? "invalid_request", 409);
  return Response.json(result);
}
