import { connection } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { adminOrders } from "@/lib/server/orders";

// 擔保交易訂單，申訴中的排最前面
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  return Response.json({ orders: await adminOrders(a.db) });
}
