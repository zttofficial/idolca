import { chainError, fail, requireWalletUser } from "@/lib/server/require-user";
import { buildBuyback } from "@/lib/server/packs";

// 即時回購：組好「NFT 轉給平台、平台付貨款」的交易，持有人簽名送出
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as { cardId?: string };
  if (typeof body.cardId !== "string") return fail("invalid_request");
  const result = await buildBuyback(a.db, a.user.id, a.wallet, body.cardId).catch((err) => ({ response: chainError(err) }));
  if ("response" in result) return result.response;
  if ("error" in result) return fail(result.error ?? "not_found", 409);
  return Response.json(result);
}
