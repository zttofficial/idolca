import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { VERIFICATION, collectorItems, type Verification } from "@/lib/server/schema";
import { chainAttributes, publicItem } from "@/lib/server/items";
import { markFakeOnChain } from "@/lib/server/chain";

// 平台把自由上鏈的卡標成假卡（被檢舉或寄到金庫查出是假），同時下架。
// 已上鏈的卡同步改寫鏈上名稱和屬性並凍結 NFT，這一步不可逆，所以鏈上的假卡不能再改回待驗證。
// 用 ADMIN_TOKEN 保護；正式版換成後台帳號權限
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/items/[id]">) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || request.headers.get("x-admin-token") !== token) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { verification?: string; note?: string };
  if (!VERIFICATION.includes(body.verification as Verification)) return Response.json({ error: "invalid_verification" }, { status: 400 });
  const fake = body.verification === "fake";

  const [current] = await db.select().from(collectorItems).where(eq(collectorItems.id, id));
  if (!current) return Response.json({ error: "not_found" }, { status: 404 });
  if (current.fakeTx && !fake) return Response.json({ error: "permanent_on_chain" }, { status: 409 });

  let fakeTx = current.fakeTx;
  if (fake && current.mintTx && !current.fakeTx) {
    try {
      fakeTx = await markFakeOnChain(current.asset, chainAttributes(current));
    } catch (err) {
      console.error("mark fake failed", err);
      return Response.json({ error: "chain_failed" }, { status: 502 });
    }
  }

  const [row] = await db
    .update(collectorItems)
    .set({
      verification: body.verification as Verification,
      verificationNote: body.note?.slice(0, 200) ?? null,
      verifiedAt: fake ? new Date() : null,
      fakeTx,
      ...(fake ? { priceCents: null, listedAt: null } : {}),
    })
    .where(eq(collectorItems.id, id))
    .returning();
  return Response.json({ item: publicItem(row) });
}
