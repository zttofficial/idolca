import { after, connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { currentUser } from "@/lib/server/auth";
import { auctionDetail, auctionsDue, sweepAuctions } from "@/lib/server/auctions";

// 拍賣的即時狀態（拍賣頁每隔幾秒讀一次）：目前出價、截止時間、出價紀錄，登入時加上自己的狀態。
// 有到期的拍賣或待退款的出價時，回應後順便結標、退款（排程一天只跑一次，靠這裡及時處理）
export async function GET(_request: Request, ctx: RouteContext<"/api/auctions/[id]">) {
  await connection();
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });
  const user = await currentUser(db);
  const detail = await auctionDetail(db, (await ctx.params).id, user?.id ?? null);
  if (!detail) return Response.json({ error: "not_found" }, { status: 404 });
  if (await auctionsDue(db)) after(() => sweepAuctions(db));
  return Response.json({ auction: detail });
}
