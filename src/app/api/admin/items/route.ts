import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { collectorItems } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { publicItem } from "@/lib/server/items";

// 最近自由上鏈的卡，管理頁用來標假卡
export async function GET(request: Request) {
  await connection();
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const rows = await a.db.select().from(collectorItems).orderBy(desc(collectorItems.createdAt)).limit(100);
  return Response.json({ items: rows.map(publicItem) });
}
