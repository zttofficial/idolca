import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { publicListings } from "@/lib/server/market-data";

// 公開的自由刊登列表（一口價和拍賣中），不需要登入
export async function GET() {
  await connection();
  const db = await getDb();
  return Response.json({ listings: db ? await publicListings(db) : [] });
}
