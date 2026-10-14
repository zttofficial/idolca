import { connection } from "next/server";
import { fail, requireUser } from "@/lib/server/require-user";
import { setOrderAddress } from "@/lib/server/orders";
import { parseAddress } from "@/lib/shipping";

// 買家填寫或修改收件地址：已付款、還沒寄出的訂單（拍賣得標的訂單在這裡補填）
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/address">) {
  await connection();
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { address?: unknown };
  const address = parseAddress(body.address);
  if (!address) return fail("invalid_address");
  const row = await setOrderAddress(a.db, a.user.id, (await ctx.params).id, address);
  if (!row) return fail("not_paid", 409);
  return Response.json({ ok: true });
}
