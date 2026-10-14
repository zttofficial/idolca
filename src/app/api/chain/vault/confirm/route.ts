import { redemptions } from "@/lib/server/schema";
import { fail, requireWalletUser } from "@/lib/server/require-user";
import { confirmSignature, invalidateVaultState, redeemMemo, vaultState } from "@/lib/server/vault-chain";
import { verifyPayment } from "@/lib/server/funds";
import { REDEEM_FEE_USDT, parseAddress } from "@/lib/shipping";
import { PublicKey } from "@solana/web3.js";

// 錢包送出交易後回報簽名：等確認、刷新鏈上狀態；提貨申請另外記一筆，平台出貨時用
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as { action?: string; cardId?: string; signature?: string; address?: unknown };
  if (typeof body.signature !== "string" || typeof body.cardId !== "string") return fail("invalid_request");
  try {
    await confirmSignature(body.signature);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "tx_failed");
  }
  invalidateVaultState();
  const state = (await vaultState())[body.cardId];
  // 只有凍結中的 NFT 的持有人能登記提貨，別人拿到簽名也改不了收件地址
  if (body.action === "redeem" && state?.redeeming && state.owner === a.wallet) {
    // 運費和凍結在同一筆交易裡：對帳成功才標記已付；沒付的申請後台看得到，不會寄出
    const coin = REDEEM_FEE_USDT === 0 ? null : await verifyPayment(body.signature, new PublicKey(a.wallet), REDEEM_FEE_USDT, redeemMemo(body.cardId));
    const feePaid = REDEEM_FEE_USDT === 0 || coin !== null;
    const address = parseAddress(body.address);
    const row = {
      cardId: body.cardId,
      userId: a.user.id,
      wallet: a.wallet,
      requestTx: body.signature,
      shipTx: null,
      shippingAddress: address ? JSON.stringify(address) : null,
      feeCents: Math.round(REDEEM_FEE_USDT * 100),
      feePaid: feePaid ? 1 : 0,
      coin: coin ?? ("usdt" as const),
      shippedAt: null,
      cancelTx: null,
      refundTx: null,
      cancelledAt: null,
      createdAt: new Date(),
    };
    await a.db.insert(redemptions).values(row).onConflictDoUpdate({ target: redemptions.cardId, set: row });
  }
  return Response.json({ state });
}
