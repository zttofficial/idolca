import { connection } from "next/server";
import { fail, requireUser } from "@/lib/server/require-user";
import { markShipped } from "@/lib/server/orders";
import { parseTracking } from "@/lib/tracking";

// 賣家標記已寄出：帶上物流單號（必填，物流商選填）和他看到的收件地址的填寫時間（addressAt），買家剛改過地址時回 address_changed
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/ship">) {
  await connection();
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { addressAt?: unknown; tracking?: unknown };
  const tracking = parseTracking(body.tracking);
  if (!tracking) return fail("invalid_tracking", 400);
  const result = await markShipped(a.db, a.user.id, (await ctx.params).id, body.addressAt, tracking);
  if ("error" in result) return fail(result.error ?? "not_paid", 409);
  return Response.json({ ok: true });
}
