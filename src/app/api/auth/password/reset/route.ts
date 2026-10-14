import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/lib/server/schema";
import { MIN_PASSWORD, endAllSessions, hashPassword, publicUser, startSession } from "@/lib/server/auth";
import { consumeToken } from "@/lib/server/email-auth";
import { allow, clientIp, tooMany } from "@/lib/server/rate-limit";
import { fail } from "@/lib/server/require-user";

// 用重設連結設新密碼。能收到信就證明持有信箱，所以順帶把信箱標成已驗證；
// 其他裝置的會話全部登出（可能是被盜後才來重設），這台直接登入
export async function POST(request: Request) {
  const db = await getDb();
  if (!db) return fail("not_configured", 503);
  if (!(await allow(db, `reset:${clientIp(request)}`, 20, 900))) return tooMany();
  const body = (await request.json().catch(() => ({}))) as { token?: unknown; password?: string };
  const password = body.password ?? "";
  // 先檢查密碼再用掉令牌，密碼太短時連結還能再用
  if (password.length < MIN_PASSWORD) return fail("weak_password");
  const user = await consumeToken(db, body.token, "reset");
  if (!user) return fail("invalid_token");
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
    .where(eq(users.id, user.id))
    .returning();
  await endAllSessions(db, user.id);
  await startSession(db, user.id);
  return Response.json({ user: publicUser(updated) });
}
