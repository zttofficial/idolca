import { fail, requireUser } from "@/lib/server/require-user";
import { confirmOrderPayment } from "@/lib/server/orders";

// 買家的付款交易送出後回報簽名，伺服器對帳
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/confirm">) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { signature?: string };
  if (typeof body.signature !== "string") return fail("invalid_request");
  const result = await confirmOrderPayment(a.db, a.user.id, (await ctx.params).id, body.signature);
  if ("error" in result) return fail(result.error ?? "payment_not_found", 409);
  return Response.json(result);
}
