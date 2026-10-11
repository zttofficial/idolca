import "server-only";
import { requireUser } from "./require-user";

// 管理接口共用：要登入，而且是管理員（見 auth.ts 的 isAdmin）
export async function requireAdmin() {
  const a = await requireUser();
  if (a.error) return { error: a.error };
  if (!a.user.isAdmin) return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  return { db: a.db, user: a.user };
}
