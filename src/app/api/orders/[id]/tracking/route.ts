import { connection } from "next/server";
import { fail, requireUser } from "@/lib/server/require-user";
import { updateTracking } from "@/lib/server/orders";
import { parseTracking } from "@/lib/tracking";

// 賣家更正物流單號：寄出後、買家確認或申訴前
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/tracking">) {
  await connection();
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { tracking?: unknown };
  const tracking = parseTracking(body.tracking);
  if (!tracking) return fail("invalid_tracking", 400);
  const result = await updateTracking(a.db, a.user.id, (await ctx.params).id, tracking);
  if ("error" in result) return fail(result.error ?? "not_shipped", 409);
  return Response.json({ ok: true });
}
