import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { getPack } from "@/lib/server/pack-pool";
import { drawable } from "@/lib/server/packs";
import { marketReady, vaultState } from "@/lib/server/vault-chain";

// 卡包和卡池的即時狀態（剩餘、機率、種子承諾），卡包頁打開和關掉開包畫面時重讀。
// 剩餘張數按鏈上狀態再核一次（和下單時的檢查一致）：卡已經不在平台錢包裡（例如被掛單、提貨）就不算剩餘
export async function GET(_request: Request, ctx: RouteContext<"/api/packs/[id]/pool">) {
  await connection();
  const db = await getDb();
  const pack = db ? await getPack(db, (await ctx.params).id) : null;
  if (!pack) return Response.json({ error: "not_found" }, { status: 404 });
  if (marketReady()) {
    const state = await vaultState().catch(() => null);
    if (state) pack.pool = pack.pool.map((e) => (e.remaining && !drawable(state[e.id]) ? { ...e, remaining: 0 } : e));
  }
  return Response.json({ pack });
}
