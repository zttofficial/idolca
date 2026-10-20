import { connection } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { adminUserDetail } from "@/lib/server/admin-queries";

// 用戶詳情：帳號資料、各類紀錄的數量和最近的訂單、金庫卡成交、開包
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const detail = await adminUserDetail(a.db, (await ctx.params).id);
  if (!detail) return fail("not_found", 404);
  return Response.json(detail);
}
