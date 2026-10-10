import { eq } from "drizzle-orm";
import { redemptions } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { shipRedemption, vaultState } from "@/lib/server/vault-chain";

// 平台寄出實物：在同一筆交易裡解凍並銷毀 NFT
export async function POST(request: Request, ctx: RouteContext<"/api/admin/redemptions/[cardId]/ship">) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const { cardId } = await ctx.params;
  if (!(await vaultState())[cardId]?.redeeming) return Response.json({ error: "not_redeeming" }, { status: 409 });
  try {
    const shipTx = await shipRedemption(cardId);
    await a.db.update(redemptions).set({ shipTx }).where(eq(redemptions.cardId, cardId));
    return Response.json({ shipTx });
  } catch (err) {
    console.error("ship failed", err);
    return Response.json({ error: "chain_failed" }, { status: 502 });
  }
}
