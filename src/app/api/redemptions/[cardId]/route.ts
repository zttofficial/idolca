import { connection } from "next/server";
import { requireUser } from "@/lib/server/require-user";
import { myRedemption } from "@/lib/server/redemption-tracking";

// 我對這張金庫卡的提貨申請：出貨時間和物流單號（卡片頁顯示）；不是我申請的回 null
export async function GET(_request: Request, ctx: RouteContext<"/api/redemptions/[cardId]">) {
  await connection();
  const a = await requireUser();
  if (a.error) return a.error;
  return Response.json({ redemption: await myRedemption(a.db, (await ctx.params).cardId, a.user) });
}
