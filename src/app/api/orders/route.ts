import { fail, requireUser, requireWalletUser } from "@/lib/server/require-user";
import { createOrder, myOrders } from "@/lib/server/orders";
import { marketReady } from "@/lib/server/vault-chain";

// 我買的和我賣的擔保交易訂單
export async function GET() {
  const a = await requireUser();
  if (a.error) return a.error;
  return Response.json({ orders: await myOrders(a.db, a.user.id) });
}

// 購買自由刊登：建立待付款訂單，回傳要錢包簽名的付款交易
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  const body = (await request.json().catch(() => ({}))) as { itemId?: string };
  if (typeof body.itemId !== "string") return fail("invalid_request");
  const result = await createOrder(a.db, a.user.id, a.wallet, body.itemId);
  if ("error" in result) return fail(result.error ?? "not_listed", 409);
  return Response.json(result);
}
