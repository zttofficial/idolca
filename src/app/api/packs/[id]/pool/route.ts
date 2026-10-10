import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { livePool } from "@/lib/server/pack-pool";
import { PACKS } from "@/lib/packs";

// 卡池即時剩餘張數（扣掉已開出的），卡包頁用它算機率
export async function GET(_request: Request, ctx: RouteContext<"/api/packs/[id]/pool">) {
  await connection();
  const { id } = await ctx.params;
  const pack = PACKS.find((p) => p.id === id);
  if (!pack) return Response.json({ error: "not_found" }, { status: 404 });
  const db = await getDb();
  return Response.json({ pool: db ? await livePool(db, pack) : pack.pool });
}
