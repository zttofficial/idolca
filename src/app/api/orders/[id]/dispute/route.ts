import { fail, requireUser } from "@/lib/server/require-user";
import { disputeOrder } from "@/lib/server/orders";

// 買家申訴：收到的卡有問題，暫停自動放款，交給平台處理
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/dispute">) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const row = await disputeOrder(a.db, a.user.id, (await ctx.params).id, typeof body.reason === "string" ? body.reason : "");
  if (!row) return fail("not_shipped", 409);
  return Response.json({ ok: true });
}
