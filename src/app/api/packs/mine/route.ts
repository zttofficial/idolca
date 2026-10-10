import { and, desc, eq, isNotNull } from "drizzle-orm";
import { packOrders } from "@/lib/server/schema";
import { requireUser } from "@/lib/server/require-user";

// 我開卡包抽到、還沒賣回平台的卡（每張都是鑄給我錢包的金庫 NFT）
export async function GET() {
  const a = await requireUser();
  if (a.error) return a.error;
  const rows = await a.db
    .select()
    .from(packOrders)
    .where(and(eq(packOrders.userId, a.user.id), isNotNull(packOrders.pulls)))
    .orderBy(desc(packOrders.createdAt));
  const pulls = rows.flatMap((r) =>
    (JSON.parse(r.pulls!) as { entryId: string; cardId: string; asset: string; tx: string; buybackTx?: string }[])
      .filter((p) => !p.buybackTx)
      .map((p) => ({ ...p, packId: r.packId, openedAt: r.createdAt.toISOString() })),
  );
  return Response.json({ pulls });
}
