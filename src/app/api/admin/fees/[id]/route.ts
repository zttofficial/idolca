import { after } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { syncChainFees } from "@/lib/server/vault-chain";
import { removeFeeRule } from "@/lib/server/fees";

// 刪除還沒開始的規則，或提前結束進行中的促銷；已生效的基本費率不能刪
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/fees/[id]">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { id } = await ctx.params;
  const r = await removeFeeRule(a.db, id);
  if (r.error) return fail(r.error, r.error === "not_found" ? 404 : 409);
  // 金庫卡的抽成和拍賣手續費在鏈上，規則改了馬上同步（之後的購買、開拍也會在同一筆交易裡再對一次）
  after(() => syncChainFees(true).catch((err) => console.error("sync chain fees failed", err)));
  return Response.json({ ok: true });
}
