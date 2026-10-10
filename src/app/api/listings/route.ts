import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { listListings } from "@/lib/server/items";

// 公開的自由刊登列表，不需要登入
export async function GET() {
  await connection();
  const db = await getDb();
  if (!db) return Response.json({ listings: [] });
  return Response.json({ listings: await listListings(db) });
}
