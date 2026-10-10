import { and, eq } from "drizzle-orm";
import { collectorItems } from "@/lib/server/schema";
import { priceToCents, publicItem } from "@/lib/server/items";
import { requireUser } from "@/lib/server/require-user";

// 持有人刊登或下架自己的卡：priceUsdt 為數字時刊登（或改價），為 null 時下架。假卡不能刊登
export async function PATCH(request: Request, ctx: RouteContext<"/api/items/[id]">) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { priceUsdt?: unknown };
  const price = priceToCents(body.priceUsdt ?? null);
  if (price === undefined) return Response.json({ error: "invalid_price" }, { status: 400 });

  const where = and(eq(collectorItems.id, id), eq(collectorItems.userId, a.user.id));
  const [current] = await a.db.select().from(collectorItems).where(where);
  if (!current) return Response.json({ error: "not_found" }, { status: 404 });
  if (price !== null && current.verification === "fake") return Response.json({ error: "fake" }, { status: 409 });

  const [row] = await a.db
    .update(collectorItems)
    .set({ priceCents: price, listedAt: price === null ? null : (current.listedAt ?? new Date()) })
    .where(where)
    .returning();
  return Response.json({ item: publicItem(row) });
}
