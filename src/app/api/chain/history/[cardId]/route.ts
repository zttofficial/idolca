import { connection } from "next/server";
import { CHAIN } from "@/lib/chain";
import { assetHistory } from "@/lib/server/history";

// 金庫卡的鏈上紀錄（鑄造、掛單、成交、取消、提貨、銷毀），直接讀鏈
export async function GET(_request: Request, ctx: RouteContext<"/api/chain/history/[cardId]">) {
  await connection();
  const asset = CHAIN.cards[(await ctx.params).cardId];
  if (!asset) return Response.json({ events: [] });
  try {
    return Response.json({ events: await assetHistory(asset) });
  } catch {
    return Response.json({ error: "rpc_failed" }, { status: 502 });
  }
}
