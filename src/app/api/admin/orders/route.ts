import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { listParams } from "@/lib/server/admin-lists";
import { ADMIN_ORDER_VIEWS, adminOrders } from "@/lib/server/orders";

// 擔保交易訂單，一次一頁：預設是還沒結束的（申訴中的排最前面），可以按狀態、日期篩，搜訂單編號、卡名、買賣雙方的郵箱或錢包
export async function GET(request: NextRequest) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const p = listParams(request.nextUrl.searchParams);
  return Response.json(await adminOrders(a.db, { ...p, view: p.pick("status", ADMIN_ORDER_VIEWS, "open") }));
}
