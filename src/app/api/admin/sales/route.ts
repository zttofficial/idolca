import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { listParams } from "@/lib/server/admin-lists";
import { adminSales, adminSalesTotals, saleFilter } from "@/lib/server/admin-sales";

// 銷售紀錄，一次一頁：金庫卡成交、擔保訂單、開卡包合在一起按時間倒序。第一頁（沒有游標）另外附上目前篩選下的筆數、成交額和手續費
export async function GET(request: NextRequest) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const p = listParams(request.nextUrl.searchParams);
  const f = saleFilter(p);
  const [page, totals] = await Promise.all([adminSales(a.db, f, p.cursor, p.limit), p.cursor ? null : adminSalesTotals(a.db, f)]);
  return Response.json({ ...page, totals });
}
