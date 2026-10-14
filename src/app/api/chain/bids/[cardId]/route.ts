import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { auctionBids } from "@/lib/server/history";
import { getVaultRow } from "@/lib/server/vault-cards";

// 金庫卡目前這場拍賣的出價紀錄，直接讀鏈：每一口的出價錢包、金額、時間和交易簽名，誰都能到區塊瀏覽器核對
// ?count= 是頁面看到的出價數，用來繞過舊的快取
export async function GET(request: Request, ctx: RouteContext<"/api/chain/bids/[cardId]">) {
  await connection();
  const db = await getDb();
  const asset = db ? (await getVaultRow(db, (await ctx.params).cardId))?.asset : null;
  if (!asset) return Response.json({ bids: [] });
  try {
    const count = Number(new URL(request.url).searchParams.get("count"));
    return Response.json({ bids: await auctionBids(asset, Number.isInteger(count) && count > 0 ? count : 0) });
  } catch {
    return Response.json({ error: "rpc_failed" }, { status: 502 });
  }
}
