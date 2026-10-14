import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/lib/server/schema";
import { consumeToken } from "@/lib/server/email-auth";
import { fail } from "@/lib/server/require-user";

// 點驗證信的連結：頁面打開後送出令牌。不要求登入，用戶常在手機上開信、電腦上用網站
export async function POST(request: Request) {
  const db = await getDb();
  if (!db) return fail("not_configured", 503);
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const user = await consumeToken(db, body.token, "verify");
  if (!user) return fail("invalid_token", 400);
  if (!user.emailVerifiedAt) await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  return Response.json({ ok: true });
}
