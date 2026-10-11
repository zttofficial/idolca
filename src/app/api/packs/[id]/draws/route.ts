import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { getPack, packDraws } from "@/lib/server/pack-pool";

// 公平性核對：種子承諾、（結束後）種子本身，以及每一抽的付款交易、序號、卡池大小、位置和隨機數。
// 核對方法：r = HMAC-SHA256(種子, 付款交易簽名:序號)；位置 = floor(r 前 12 位十六進位 / 2^48 × 卡池大小)；
// 卡池按編號排序後的第「位置」張就是抽中的卡
export async function GET(_request: Request, ctx: RouteContext<"/api/packs/[id]/draws">) {
  await connection();
  const db = await getDb();
  const id = (await ctx.params).id;
  const pack = db ? await getPack(db, id) : null;
  if (!db || !pack) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ seedHash: pack.seedHash, seed: pack.seed, draws: await packDraws(db, id) });
}
