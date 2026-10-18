import { and, eq } from "drizzle-orm";
import { collectorItems } from "@/lib/server/schema";
import { MAX_DESCRIPTION, priceToCents, publicItem } from "@/lib/server/items";
import { requireUser, unverifiedEmail } from "@/lib/server/require-user";
import { liveAuction } from "@/lib/server/auctions";
import { openOrders } from "@/lib/server/orders";
import { notifyIndexNow } from "@/lib/server/indexnow";
import { impersonatesPlatform } from "@/lib/server/names";

// 持有人改自己的卡：
// - priceUsdt 為數字時刊登（或改價），為 null 時下架；假卡、拍賣中的卡不能一口價刊登。刊登不需要上鏈，但郵箱帳號要先驗證信箱
// - description 改描述（空字串清除）；NFT 元數據即時讀資料庫，不用改鏈上
export async function PATCH(request: Request, ctx: RouteContext<"/api/items/[id]">) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { priceUsdt?: unknown; description?: unknown };

  const where = and(eq(collectorItems.id, id), eq(collectorItems.userId, a.user.id));
  const [current] = await a.db.select().from(collectorItems).where(where);
  if (!current) return Response.json({ error: "not_found" }, { status: 404 });

  const changes: Partial<typeof collectorItems.$inferInsert> = {};
  if ("priceUsdt" in body) {
    const price = priceToCents(body.priceUsdt ?? null);
    if (price === undefined) return Response.json({ error: "invalid_price" }, { status: 400 });
    const unverified = price !== null && unverifiedEmail(a.user);
    if (unverified) return unverified;
    if (price !== null && current.verification === "fake") return Response.json({ error: "fake" }, { status: 409 });
    // 已申請寄進金庫（或已轉成金庫卡）的不能再刊登
    if (price !== null && (current.vaultRequestedAt || current.vaultCardId)) return Response.json({ error: "in_vault" }, { status: 409 });
    if (price !== null && (await liveAuction(a.db, id))) return Response.json({ error: "in_auction" }, { status: 409 });
    // 已經賣出、訂單還沒結束的卡不能重新刊登
    if (price !== null && (await openOrders(a.db, [id])).size) return Response.json({ error: "in_order" }, { status: 409 });
    changes.priceCents = price;
    changes.listedAt = price === null ? null : (current.listedAt ?? new Date());
  }
  if ("description" in body) {
    if (typeof body.description !== "string") return Response.json({ error: "invalid_description" }, { status: 400 });
    changes.description = body.description.trim().slice(0, MAX_DESCRIPTION) || null;
    if (changes.description && impersonatesPlatform(changes.description)) return Response.json({ error: "impersonation" }, { status: 400 });
  }
  if (!Object.keys(changes).length) return Response.json({ error: "nothing_to_change" }, { status: 400 });

  const [row] = await a.db.update(collectorItems).set(changes).where(where).returning();
  if ("priceCents" in changes) notifyIndexNow(`/listing/${id}`);
  return Response.json({ item: publicItem(row) });
}
