import { chainError, fail, requireWalletUser } from "@/lib/server/require-user";
import { createPackOrder } from "@/lib/server/packs";
import { marketReady } from "@/lib/server/vault-chain";
import { packsBlockedIn } from "@/lib/server/region";
import { arcRailBlocked } from "@/lib/server/arc-gate";

// 開卡包第一步：建訂單。Solana 付款回傳要錢包簽名的付款交易；Arc 付款（rail: "arc"）回傳要買家簽名的 USDC 授權轉帳內容
export async function POST(request: Request, ctx: RouteContext<"/api/packs/[id]/order">) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  if (packsBlockedIn(request)) return fail("region_blocked", 451);
  if (!a.user.ageConfirmed) return fail("age_required", 403);
  const body = (await request.json().catch(() => ({}))) as { qty?: number; rail?: string };
  const rail = body.rail === "arc" ? "arc" : "solana";
  if (rail === "arc") {
    const blocked = arcRailBlocked(a.user);
    if (blocked) return blocked;
  }
  const result = await createPackOrder(a.db, a.user.id, a.wallet, (await ctx.params).id, Number(body.qty), rail).catch((err) => ({ response: chainError(err) }));
  if ("response" in result) return result.response;
  if ("error" in result) return fail(result.error ?? "invalid_request", 409);
  return Response.json(result);
}
