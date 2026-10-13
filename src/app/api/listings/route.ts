import { after, connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { listListings } from "@/lib/server/items";
import { auctionsDue, sweepAuctions } from "@/lib/server/auctions";

// 公開的自由刊登列表（一口價和拍賣中），不需要登入。有到期的拍賣時回應後順便結標
export async function GET() {
  await connection();
  const db = await getDb();
  if (!db) return Response.json({ listings: [] });
  if (await auctionsDue(db)) after(() => sweepAuctions(db));
  return Response.json({ listings: await listListings(db) });
}
