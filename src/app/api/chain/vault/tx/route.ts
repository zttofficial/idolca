import { PublicKey } from "@solana/web3.js";
import { allow, tooMany } from "@/lib/server/rate-limit";
import { chainError, fail, requireWalletUser } from "@/lib/server/require-user";
import { buildBid, buildBuy, buildCancel, buildCancelAuction, buildCreateAuction, buildList, buildRedeemRequest, marketReady, vaultAuctionsReady, vaultState } from "@/lib/server/vault-chain";
import { REDEEM_FEE_USDT, parseAddress } from "@/lib/shipping";
import { AUCTION_DAYS, AUCTION_MIN_START } from "@/lib/auction";

// 金庫卡的交易：伺服器組好、用戶錢包簽名送出。buy 購買、list 掛單、cancel 取消掛單、redeem 申請提貨（要附收件地址，交易裡含運費）；
// auction 開拍（起標價、可選的保底價、天數）、bid 出價、cancelAuction 在沒人出價前取消拍賣
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  // 手續費和帳戶租金由平台付，限制每個帳號組交易的次數，免得被反覆掛單、取消耗光平台的 SOL
  if (!(await allow(a.db, `vault-tx:${a.user.id}`, 60, 3600))) return tooMany();
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    cardId?: string;
    priceUsdt?: number;
    address?: unknown;
    startUsd?: unknown;
    reserveUsd?: unknown;
    days?: unknown;
    amountUsd?: unknown;
  };
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
      case "auction": {
        const start = Number(body.startUsd);
        const reserve = body.reserveUsd === null || body.reserveUsd === undefined || body.reserveUsd === "" ? null : Number(body.reserveUsd);
        const days = Number(body.days);
        if (!(await vaultAuctionsReady())) return fail("auctions_not_ready", 503);
        if (state.owner !== a.wallet || state.redeeming || state.listing) return fail("not_allowed", 403);
        if (!Number.isFinite(start) || start < AUCTION_MIN_START || start > 100_000) return fail("invalid_start");
        if (reserve !== null && (!Number.isFinite(reserve) || reserve < start || reserve > 100_000)) return fail("invalid_reserve");
        if (!(AUCTION_DAYS as readonly number[]).includes(days)) return fail("invalid_duration");
        return Response.json({ tx: await buildCreateAuction(card, me, start, reserve, days) });
      }
      case "bid": {
        const amount = Number(body.amountUsd);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) return fail("bid_too_low");
        return Response.json({ tx: await buildBid(card, me, amount) });
      }
      case "cancelAuction":
        if (state.auction?.seller !== a.wallet) return fail("not_allowed", 403);
        if (state.auction.bidCount > 0) return fail("has_bids", 409);
        return Response.json({ tx: await buildCancelAuction(card, me) });
      case "redeem":
        if (state.owner !== a.wallet || state.redeeming) return fail("not_allowed", 403);
        if (!parseAddress(body.address)) return fail("invalid_address");
        return Response.json({ tx: await buildRedeemRequest(card, me, REDEEM_FEE_USDT), feeUsdt: REDEEM_FEE_USDT });
      default:
        return fail("invalid_action");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (["not_listed", "own_listing", "not_on_chain", "auction_ended", "own_auction", "already_leading", "bid_too_low"].includes(message)) return fail(message);
    return chainError(err);
  }
}
