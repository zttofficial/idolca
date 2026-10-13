import { fail, requireWalletUser } from "@/lib/server/require-user";
import { createBid } from "@/lib/server/auctions";
import { marketReady } from "@/lib/server/vault-chain";
import { arcRailBlocked } from "@/lib/server/arc-gate";
import { allow, tooMany } from "@/lib/server/rate-limit";

// 自由刊登拍賣的出價：先建一筆待付款的出價。Solana 付款回傳要錢包簽名的付款交易；Arc 付款（rail: "arc"）回傳要簽的 USDC 授權。
// 付款確認後才算出價（/api/bids/[id]/confirm）
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  if (!(await allow(a.db, `bid:${a.user.id}`, 30, 600))) return tooMany();
  const body = (await request.json().catch(() => ({}))) as { auctionId?: unknown; amountUsd?: unknown; rail?: unknown };
  if (typeof body.auctionId !== "string") return fail("invalid_request");
  const rail = body.rail === "arc" ? "arc" : "solana";
  if (rail === "arc") {
    const blocked = arcRailBlocked(a.user);
    if (blocked) return blocked;
  }
  const result = await createBid(a.db, a.user.id, a.wallet, body.auctionId, body.amountUsd, rail);
  if ("error" in result) return fail(result.error ?? "auction_ended", 409);
  return Response.json(result);
}
