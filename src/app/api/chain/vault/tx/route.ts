import { PublicKey } from "@solana/web3.js";
import { fail, requireWalletUser } from "@/lib/server/require-user";
import { buildBuy, buildCancel, buildList, buildRedeemRequest, marketReady, vaultState } from "@/lib/server/vault-chain";

// 金庫卡的交易：伺服器組好、用戶錢包簽名送出。buy 購買、list 掛單、cancel 取消掛單、redeem 申請提貨
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  const body = (await request.json().catch(() => ({}))) as { action?: string; cardId?: string; priceUsdt?: number };
  const card = body.cardId ?? "";
  const state = (await vaultState())[card];
  if (!state || state.burned) return fail("not_found", 404);
  const me = new PublicKey(a.wallet);
  try {
    switch (body.action) {
      case "buy":
        return Response.json({ tx: await buildBuy(card, me) });
      case "list": {
        const price = Number(body.priceUsdt);
        if (state.owner !== a.wallet || state.redeeming) return fail("not_allowed", 403);
        if (!Number.isFinite(price) || price <= 0 || price > 100_000) return fail("invalid_price");
        return Response.json({ tx: await buildList(card, me, price) });
      }
      case "cancel":
        if (state.listing?.seller !== a.wallet) return fail("not_allowed", 403);
        return Response.json({ tx: await buildCancel(card, me) });
      case "redeem":
        if (state.owner !== a.wallet || state.redeeming) return fail("not_allowed", 403);
        return Response.json({ tx: await buildRedeemRequest(card, me) });
      default:
        return fail("invalid_action");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "chain_failed";
    console.error("build tx failed", err);
    return fail(["not_listed", "own_listing", "not_on_chain"].includes(message) ? message : "chain_failed");
  }
}
