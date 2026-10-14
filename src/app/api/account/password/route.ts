import { eq } from "drizzle-orm";
import { users } from "@/lib/server/schema";
import { MIN_PASSWORD, endAllSessions, hashPassword, startSession, verifyPassword } from "@/lib/server/auth";
import { allow, tooMany } from "@/lib/server/rate-limit";
import { fail, requireUser } from "@/lib/server/require-user";

// 改密碼：要先輸入目前的密碼。改完其他裝置全部登出，這台保持登入
export async function POST(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  if (!(await allow(a.db, `password:${a.user.id}`, 10, 900))) return tooMany();
  const body = (await request.json().catch(() => ({}))) as { current?: string; password?: string };
  const [row] = await a.db.select().from(users).where(eq(users.id, a.user.id)).limit(1);
  if (!row?.passwordHash) return fail("no_password");
  if (!(await verifyPassword(body.current ?? "", row.passwordHash))) return fail("wrong_password", 401);
  const password = body.password ?? "";
  if (password.length < MIN_PASSWORD) return fail("weak_password");
  await a.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, row.id));
  await endAllSessions(a.db, row.id);
  await startSession(a.db, row.id);
  return Response.json({ ok: true });
}
