import { chainError, fail, requireUser, requireWalletUser } from "@/lib/server/require-user";
import { createOrder, myOrders, sweepOrders } from "@/lib/server/orders";
import { marketReady } from "@/lib/server/vault-chain";
import { arcRailBlocked } from "@/lib/server/arc-gate";
import { parseAddress } from "@/lib/shipping";
import { myVaultTrades, syncVaultTrades } from "@/lib/server/vault-trades";

// 我買的和我賣的擔保交易訂單，以及錢包在金庫卡上的成交（一口價和拍賣）。先處理已逾時的訂單、同步鏈上新的成交，
// 排程沒跑到時看到的也是對的；同步失敗時照樣回傳已同步的紀錄
export async function GET() {
  const a = await requireUser();
  if (a.error) return a.error;
  await Promise.all([sweepOrders(a.db), syncVaultTrades(a.db).catch((err) => console.error("sync vault trades failed", err))]);
  const wallet = a.user.walletAddress;
  const [orders, trades] = await Promise.all([myOrders(a.db, a.user.id), wallet ? myVaultTrades(a.db, wallet) : []]);
  return Response.json({ orders, trades });
}

// 購買自由刊登：建立待付款訂單，買家的收件地址（address）必填。Solana 付款回傳要錢包簽名的付款交易；Arc 付款（rail: "arc"）回傳要買家簽名的 USDC 授權轉帳內容
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  const body = (await request.json().catch(() => ({}))) as { itemId?: string; rail?: string; address?: unknown };
  if (typeof body.itemId !== "string") return fail("invalid_request");
  const address = parseAddress(body.address);
  if (!address) return fail("invalid_address");
  const rail = body.rail === "arc" ? "arc" : "solana";
  if (rail === "arc") {
    const blocked = arcRailBlocked(a.user);
    if (blocked) return blocked;
  }
  const result = await createOrder(a.db, a.user.id, a.wallet, body.itemId, rail, address).catch((err) => ({ response: chainError(err) }));
  if ("response" in result) return result.response;
  if ("error" in result) return fail(result.error ?? "not_listed", 409);
  return Response.json(result);
}
