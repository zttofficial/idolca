import { and, eq } from "drizzle-orm";
import { collectorItems } from "@/lib/server/schema";
import { MAX_DESCRIPTION, priceToCents, publicItem } from "@/lib/server/items";
import { requireUser } from "@/lib/server/require-user";

// 持有人改自己的卡：
// - priceUsdt 為數字時刊登（或改價），為 null 時下架；假卡不能刊登
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
    if (price !== null && current.verification === "fake") return Response.json({ error: "fake" }, { status: 409 });
    // 已申請寄進金庫（或已轉成金庫卡）的不能再刊登
    if (price !== null && (current.vaultRequestedAt || current.vaultCardId)) return Response.json({ error: "in_vault" }, { status: 409 });
    changes.priceCents = price;
    changes.listedAt = price === null ? null : (current.listedAt ?? new Date());
  }
  if ("description" in body) {
    if (typeof body.description !== "string") return Response.json({ error: "invalid_description" }, { status: 400 });
    changes.description = body.description.trim().slice(0, MAX_DESCRIPTION) || null;
  }
  if (!Object.keys(changes).length) return Response.json({ error: "nothing_to_change" }, { status: 400 });

  const [row] = await a.db.update(collectorItems).set(changes).where(where).returning();
  return Response.json({ item: publicItem(row) });
}
