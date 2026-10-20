import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { users } from "@/lib/server/schema";

// 撤銷管理員：把 role 改回 user。不能撤銷自己，免得後台沒人能管；ADMIN_WALLETS 裡的錢包撤了 role 也還是管理員
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/admins/[userId]">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { userId } = await ctx.params;
  if (userId === a.user.id) return fail("cannot_revoke_self", 409);
  const [row] = await a.db.update(users).set({ role: "user" }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!row) return fail("not_found", 404);
  return Response.json({ ok: true });
}
