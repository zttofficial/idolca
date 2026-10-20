import { after } from "next/server";
import { redemptions } from "@/lib/server/schema";
import { fail, requireWalletUser } from "@/lib/server/require-user";
import { confirmSignature, readCardState, redeemMemo } from "@/lib/server/vault-chain";
import { verifyPayment } from "@/lib/server/funds";
import { notifyVaultTx } from "@/lib/server/vault-notify";
import { parseAddress, redeemCharge } from "@/lib/shipping";
import { getVaultRow } from "@/lib/server/vault-cards";
import { PublicKey } from "@solana/web3.js";

// 錢包送出交易後回報簽名：等確認、刷新鏈上狀態；提貨申請另外記一筆，平台出貨時用。
// 回應後讀這筆交易的事件發通知（出價、成交）
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
  after(() => notifyVaultTx(a.db, body.signature!).catch((err) => console.error("vault notify failed", err)));
  const state = await readCardState(body.cardId);
  // 只有凍結中的 NFT 的持有人能登記提貨，別人拿到簽名也改不了收件地址
  if (body.action === "redeem" && state?.redeeming && state.owner === a.wallet) {
    // 運費、稅和凍結在同一筆交易裡：按卡所在的金庫（從資料庫讀）和這次回報的收件國家、省份重算（和組交易用同一個 redeemCharge），
    // 鏈上付的金額要剛好等於運費加稅才標記已付（組交易時用的是另一個國家或省份、金額對不上，或那個金庫不寄這裡，就當沒付）；
    // 沒付的申請後台看得到，不會寄出，只能取消
    const address = parseAddress(body.address);
    const card = await getVaultRow(a.db, body.cardId);
    const charge = address && card ? redeemCharge(card.vault, address) : null;
    const coin = charge ? await verifyPayment(body.signature, new PublicKey(a.wallet), charge.totalCents / 100, redeemMemo(body.cardId)) : null;
    const feePaid = coin !== null;
    const row = {
      cardId: body.cardId,
      userId: a.user.id,
      wallet: a.wallet,
      requestTx: body.signature,
      shipTx: null,
      trackingCarrier: null,
      trackingNumber: null,
      shippingAddress: address ? JSON.stringify(address) : null,
      feeCents: charge?.feeCents ?? 0,
      taxCents: charge?.taxCents ?? 0,
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
