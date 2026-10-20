import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { listParams } from "@/lib/server/admin-lists";
import { adminUsers } from "@/lib/server/admin-queries";

// 用戶，一次一頁，新註冊的在前：搜郵箱、錢包（開頭相符）、暱稱、帳號 id，可以只看管理員
export async function GET(request: NextRequest) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  return Response.json(await adminUsers(a.db, listParams(request.nextUrl.searchParams)));
}
