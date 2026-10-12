import { and, eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import { collectorItems } from "@/lib/server/schema";
import { chainAttributes } from "@/lib/server/items";
import { buildUserMint } from "@/lib/server/funds";
import { platformUmi } from "@/lib/server/chain";
import { fail, requireWalletUser } from "@/lib/server/require-user";

// 自己付費把收藏卡上鏈，第一步：組好鑄造交易（手續費和押金由用戶錢包付），回傳交易和新 NFT 的地址。
// 只有綁了錢包的帳號、還沒上鏈的卡；假卡和寄進金庫的卡不能上鏈
export async function POST(_request: Request, ctx: RouteContext<"/api/items/[id]/mint">) {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!platformUmi()) return fail("not_configured", 503);
  const [item] = await a.db.select().from(collectorItems).where(and(eq(collectorItems.id, (await ctx.params).id), eq(collectorItems.userId, a.user.id)));
  if (!item) return fail("not_found", 404);
  if (item.mintTx) return fail("already_minted", 409);
  if (item.verification === "fake" || item.vaultRequestedAt || item.vaultCardId) return fail("not_mintable", 409);
  return Response.json(await buildUserMint(item.id, chainAttributes(item), new PublicKey(a.wallet)));
}
