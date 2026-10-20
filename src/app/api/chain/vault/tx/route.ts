import { PublicKey } from "@solana/web3.js";
import { allow, tooMany } from "@/lib/server/rate-limit";
import { chainError, fail, requireWalletUser } from "@/lib/server/require-user";
import { buildBid, buildBuy, buildCancel, buildCancelAuction, buildCreateAuction, buildList, buildRedeemRequest, marketReady, readCardState, vaultAuctionsReady } from "@/lib/server/vault-chain";
import { parseAddress, redeemCharge, redeemFeeUsd } from "@/lib/shipping";
import { getVaultRow } from "@/lib/server/vault-cards";
import { AUCTION_DAYS, AUCTION_MIN_START } from "@/lib/auction";

// 金庫卡的交易：伺服器組好、用戶錢包簽名送出。buy 購買、list 掛單、cancel 取消掛單、redeem 申請提貨（要附收件地址，交易裡含運費和加拿大境內的 GST/HST）；
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
  // 即時讀這張卡（不用索引）：權限檢查和組交易都以鏈上此刻的狀態為準
  const state = await readCardState(card);
  if (!state || state.burned) return fail("not_found", 404);
  const me = new PublicKey(a.wallet);
  try {
    switch (body.action) {
      case "buy":
        return Response.json({ tx: await buildBuy(card, me, state) });
      case "list": {
        const price = Number(body.priceUsdt);
        if (state.owner !== a.wallet || state.redeeming) return fail("not_allowed", 403);
        // 掛單價格取到分（見 buildList），不到一分的不收
        if (!Number.isFinite(price) || price < 0.01 || price > 100_000) return fail("invalid_price");
        return Response.json({ tx: await buildList(card, me, price) });
      }
      case "cancel":
        if (state.listing?.seller !== a.wallet) return fail("not_allowed", 403);
        return Response.json({ tx: await buildCancel(card, me, state) });
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
        return Response.json({ tx: await buildBid(card, me, amount, state) });
      }
      case "cancelAuction":
        if (state.auction?.seller !== a.wallet) return fail("not_allowed", 403);
        if (state.auction.bidCount > 0) return fail("has_bids", 409);
        return Response.json({ tx: await buildCancelAuction(card, me, state) });
      case "redeem": {
        if (state.owner !== a.wallet || state.redeeming) return fail("not_allowed", 403);
        const address = parseAddress(body.address);
        if (!address) return fail("invalid_address");
        // 運費和稅按卡所在的金庫（從資料庫讀）和收件國家、省份在伺服器算，確認時用同一個地址再算一次對帳；那個金庫不寄的地方不收
        const row = await getVaultRow(a.db, card);
        if (!row) return fail("not_found", 404);
        if (redeemFeeUsd(row.vault, address.country) === null) return fail("not_shipped_here");
        // parseAddress 已經擋掉沒有省份的加拿大地址，這裡只是保險
        const charge = redeemCharge(row.vault, address);
        if (!charge) return fail("invalid_address");
        const totalUsdt = charge.totalCents / 100;
        return Response.json({ tx: await buildRedeemRequest(card, me, totalUsdt), feeUsdt: charge.feeCents / 100, taxUsdt: charge.taxCents / 100, totalUsdt });
      }
      default:
        return fail("invalid_action");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (["not_listed", "own_listing", "not_on_chain", "auction_ended", "own_auction", "already_leading", "bid_too_low"].includes(message)) return fail(message);
    return chainError(err);
  }
}
