import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { listParams } from "@/lib/server/admin-lists";
import { adminRedemptions } from "@/lib/server/admin-queries";

// 提貨申請，一次一頁：預設是還沒寄出的（最早申請的在前），附卡所在的金庫（從那裡寄出）和鏈上狀態索引（還沒同步的卡是 null）。
// 可以按狀態、金庫篩，搜編號、錢包、物流單號
export async function GET(request: NextRequest) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  return Response.json(await adminRedemptions(a.db, listParams(request.nextUrl.searchParams)));
}
