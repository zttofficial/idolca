import { desc, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";
import { collectorItems } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { publicItem } from "@/lib/server/items";

// 最近自由上鏈的卡，管理頁用來標假卡
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  // 申請寄進金庫、等待鑑定的排最前面；已轉成金庫卡的不列
  const rows = await a.db
    .select()
    .from(collectorItems)
    .where(isNull(collectorItems.vaultCardId))
    .orderBy(sql`${collectorItems.vaultRequestedAt} IS NULL`, desc(collectorItems.createdAt))
    .limit(100);
  return Response.json({ items: rows.map(publicItem) });
}
