import { connection } from "next/server";
import { fail, requireUser } from "@/lib/server/require-user";
import { markShipped } from "@/lib/server/orders";

// 賣家標記已寄出：帶上他看到的收件地址的填寫時間（addressAt），買家剛改過地址時回 address_changed
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/ship">) {
  await connection();
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { addressAt?: unknown };
  const result = await markShipped(a.db, a.user.id, (await ctx.params).id, body.addressAt);
  if ("error" in result) return fail(result.error ?? "not_paid", 409);
  return Response.json({ ok: true });
}
