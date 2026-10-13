import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { publicVaultCards } from "@/lib/server/market-data";

// 金庫卡（公開）：實物資料和 NFT 地址，包括已提貨銷毀的（status 為 redeemed）；
// 在庫卡的持有人、掛單和提貨狀態另外讀 /api/chain/state
export async function GET() {
  await connection();
  const db = await getDb();
  return Response.json({ cards: db ? await publicVaultCards(db) : [] });
}
