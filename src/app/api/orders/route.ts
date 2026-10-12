import { fail, requireUser, requireWalletUser } from "@/lib/server/require-user";
import { createOrder, myOrders, sweepOrders } from "@/lib/server/orders";
import { marketReady } from "@/lib/server/vault-chain";
import { arcRailBlocked } from "@/lib/server/arc-gate";

// 我買的和我賣的擔保交易訂單。先處理已逾時的訂單，排程沒跑到時看到的狀態也是對的
export async function GET() {
  const a = await requireUser();
  if (a.error) return a.error;
  await sweepOrders(a.db);
  return Response.json({ orders: await myOrders(a.db, a.user.id) });
}

// 購買自由刊登：建立待付款訂單。Solana 付款回傳要錢包簽名的付款交易；Arc 付款（rail: "arc"）回傳要買家簽名的 USDC 授權轉帳內容
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  const body = (await request.json().catch(() => ({}))) as { itemId?: string; rail?: string };
  if (typeof body.itemId !== "string") return fail("invalid_request");
  const rail = body.rail === "arc" ? "arc" : "solana";
  if (rail === "arc") {
    const blocked = arcRailBlocked(a.user);
    if (blocked) return blocked;
  }
  const result = await createOrder(a.db, a.user.id, a.wallet, body.itemId, rail);
  if ("error" in result) return fail(result.error ?? "not_listed", 409);
  return Response.json(result);
}
