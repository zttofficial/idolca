import { eq } from "drizzle-orm";
import { collectorItems } from "@/lib/server/schema";
import { fail, requireUser, unverifiedEmail } from "@/lib/server/require-user";
import { publicItem } from "@/lib/server/items";
import { auctionView, cancelAuction, startAuction } from "@/lib/server/auctions";
import { notifyIndexNow } from "@/lib/server/indexnow";

// 自由刊登的拍賣：POST 開拍（起標價、可選的保底價、天數），DELETE 在還沒人出價前取消。
// 開拍不需要錢包（郵箱帳號要先驗證信箱）：出價的錢進平台託管，結標後變成擔保訂單，賣家之後綁錢包也收得到款
export async function POST(request: Request, ctx: RouteContext<"/api/items/[id]/auction">) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const unverified = unverifiedEmail(a.user);
  if (unverified) return unverified;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { startUsd?: unknown; reserveUsd?: unknown; days?: unknown };
  const result = await startAuction(a.db, a.user.id, id, { startUsd: body.startUsd, reserveUsd: body.reserveUsd, days: body.days });
  if ("error" in result) return fail(result.error ?? "not_allowed", result.error === "not_found" ? 404 : 409);
  const [row] = await a.db.select().from(collectorItems).where(eq(collectorItems.id, id));
  notifyIndexNow(`/listing/${id}`);
  return Response.json({ item: { ...publicItem(row), auction: { ...auctionView(result.auction), id: result.auction.id } } });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/items/[id]/auction">) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const { id } = await ctx.params;
  if (!(await cancelAuction(a.db, a.user.id, id))) return fail("has_bids", 409);
  const [row] = await a.db.select().from(collectorItems).where(eq(collectorItems.id, id));
  notifyIndexNow(`/listing/${id}`);
  return Response.json({ item: { ...publicItem(row), auction: null } });
}
