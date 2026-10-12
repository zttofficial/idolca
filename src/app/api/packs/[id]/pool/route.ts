import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { getPack } from "@/lib/server/pack-pool";
import { withLiveRemaining } from "@/lib/server/packs";

// 卡包和卡池的即時狀態（剩餘、機率、種子承諾），卡包頁關掉開包畫面時重讀；剩餘張數按鏈上狀態核過
export async function GET(_request: Request, ctx: RouteContext<"/api/packs/[id]/pool">) {
  await connection();
  const db = await getDb();
  const pack = db ? await getPack(db, (await ctx.params).id) : null;
  if (!pack) return Response.json({ error: "not_found" }, { status: 404 });
  const [live] = await withLiveRemaining([pack]);
  return Response.json({ pack: live });
}
