import { redemptions } from "@/lib/server/schema";
import { fail, requireWalletUser } from "@/lib/server/require-user";
import { confirmSignature, invalidateVaultState, vaultState } from "@/lib/server/vault-chain";

// 錢包送出交易後回報簽名：等確認、刷新鏈上狀態；提貨申請另外記一筆，平台出貨時用
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as { action?: string; cardId?: string; signature?: string };
  if (typeof body.signature !== "string" || typeof body.cardId !== "string") return fail("invalid_request");
  try {
    await confirmSignature(body.signature);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "tx_failed");
  }
  invalidateVaultState();
  const state = (await vaultState())[body.cardId];
  if (body.action === "redeem" && state?.redeeming) {
    const row = { cardId: body.cardId, userId: a.user.id, wallet: a.wallet, requestTx: body.signature, shipTx: null, createdAt: new Date() };
    await a.db.insert(redemptions).values(row).onConflictDoUpdate({ target: redemptions.cardId, set: row });
  }
  return Response.json({ state });
}
