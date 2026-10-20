import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { listParams } from "@/lib/server/admin-lists";
import { adminItems } from "@/lib/server/admin-queries";

// 用戶自由上鏈的卡，一次一頁：申請寄進金庫、等待鑑定的排最前面，已轉成金庫卡的不列。
// 可以按狀態篩，搜標題、團體、成員、持有人郵箱或錢包、卡的編號
export async function GET(request: NextRequest) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  return Response.json(await adminItems(a.db, listParams(request.nextUrl.searchParams)));
}
