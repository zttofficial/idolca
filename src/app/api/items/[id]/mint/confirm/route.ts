import { and, eq, isNull } from "drizzle-orm";
import { collectorItems } from "@/lib/server/schema";
import { publicItem } from "@/lib/server/items";
import { checkUserMint } from "@/lib/server/funds";
import { confirmSignature } from "@/lib/server/vault-chain";
import { fail, requireWalletUser } from "@/lib/server/require-user";

// 自己付費上鏈，第二步：鑄造交易送出後回報簽名和 NFT 地址，確認 NFT 在平台集合裡、持有人是這個錢包、指向這張卡，再記下來
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/items/[id]/mint/confirm">) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  const id = (await ctx.params).id;
  const body = (await request.json().catch(() => ({}))) as { signature?: unknown; asset?: unknown };
  if (typeof body.signature !== "string" || typeof body.asset !== "string") return fail("invalid_request");
  try {
    await confirmSignature(body.signature);
  } catch {
    return fail("tx_failed", 409);
  }
  if (!(await checkUserMint(id, body.asset, a.wallet))) return fail("mint_not_found", 409);
  const [row] = await a.db
    .update(collectorItems)
    .set({ asset: body.asset, mintTx: body.signature, ownerAddress: a.wallet })
    .where(and(eq(collectorItems.id, id), eq(collectorItems.userId, a.user.id), isNull(collectorItems.mintTx)))
    .returning();
  if (!row) return fail("already_minted", 409);
  return Response.json({ item: publicItem(row) });
}
