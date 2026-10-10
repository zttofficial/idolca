import { fail, requireWalletUser } from "@/lib/server/require-user";
import { buildBuyback } from "@/lib/server/packs";

// 即時回購：組好「NFT 轉給平台、平台付 USDT」的交易，持有人簽名送出
export async function POST(request: Request) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as { asset?: string };
  if (typeof body.asset !== "string") return fail("invalid_request");
  const result = await buildBuyback(a.db, a.user.id, a.wallet, body.asset);
  if ("error" in result) return fail(result.error ?? "not_found", 409);
  return Response.json(result);
}
