import { fail, requireUser } from "@/lib/server/require-user";
import { markShipped } from "@/lib/server/orders";

// 賣家標記已寄出
export async function POST(_request: Request, ctx: RouteContext<"/api/orders/[id]/ship">) {
  const a = await requireUser();
  if (a.error) return a.error;
  const row = await markShipped(a.db, a.user.id, (await ctx.params).id);
  if (!row) return fail("not_paid", 409);
  return Response.json({ ok: true });
}
