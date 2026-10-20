import { connection, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { listParams } from "@/lib/server/admin-lists";
import { adminCards } from "@/lib/server/admin-queries";

// 金庫卡，一次一頁：鏈上狀態讀索引表 vault_chain_state（還沒同步的卡 chain 是 null）。
// 可以按狀態（在庫、掛單、拍賣、提貨中、已提貨、未同步、可放進卡池）、金庫、評級、平台自有或寄存、是否在卡包篩，搜編號、團體、成員、錢包
export async function GET(request: NextRequest) {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  return Response.json(await adminCards(a.db, listParams(request.nextUrl.searchParams)));
}
