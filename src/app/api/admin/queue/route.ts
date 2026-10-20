import { connection } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { listParams } from "@/lib/server/admin-lists";
import { adminItems, adminQueueCounts, adminRedemptions } from "@/lib/server/admin-queries";
import { adminPackQueue } from "@/lib/server/admin-packs";
import { adminOrderCounts, adminOrders } from "@/lib/server/orders";

// 待處理：各項的數量（COUNT，走索引；頁籤上的數字也用這裡的）和每項最前面的幾筆。每項只讀固定幾列，資料再多也一樣快
const SHORT = 5;

export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const few = (params: Record<string, string>) => listParams(new URLSearchParams({ ...params, limit: String(SHORT) }));
  const [orderCounts, counts, disputes, late, redemptions, vaultRequests, packs] = await Promise.all([
    adminOrderCounts(a.db),
    adminQueueCounts(a.db),
    adminOrders(a.db, { view: "disputed", limit: SHORT }),
    adminOrders(a.db, { view: "late", limit: SHORT }),
    adminRedemptions(a.db, few({ status: "ready" })),
    adminItems(a.db, few({ status: "vault" })),
    adminPackQueue(a.db),
  ]);
  // 卡包：快賣完或暫停販售的排前面，其次正在賣的，再來 7 天內開賣的
  const low = packs.live.filter((p) => p.lowStock || p.paused);
  return Response.json({
    counts: { ...orderCounts, ...counts, packsLive: packs.live.length, packsUpcoming: packs.upcoming.length, packsLow: low.length },
    tabs: { orders: orderCounts.disputed + orderCounts.late, redemptions: counts.redemptions, items: counts.vaultRequests, packs: low.length },
    disputes: disputes.rows,
    late: late.rows,
    redemptions: redemptions.rows,
    vaultRequests: vaultRequests.rows,
    packs: [...low, ...packs.live.filter((p) => !low.includes(p)), ...packs.upcoming].slice(0, 8),
  });
}
