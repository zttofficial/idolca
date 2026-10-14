import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/lib/server/schema";
import { EMAIL_RE, MIN_PASSWORD, hashPassword, newUserId, publicUser, startSession } from "@/lib/server/auth";
import { asLocale, sendLinkMail } from "@/lib/server/email-auth";
import { allow, clientIp, tooMany } from "@/lib/server/rate-limit";

// 註冊完直接登入，同時寄驗證信；信寄不出去不擋註冊，用戶可以在帳號選單重寄
export async function POST(request: Request) {
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });
  // 擋批量註冊：每個 IP 每小時 10 個帳號
  if (!(await allow(db, `register:${clientIp(request)}`, 10, 3600))) return tooMany();

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; displayName?: string; locale?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!EMAIL_RE.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 });
  if (password.length < MIN_PASSWORD) return Response.json({ error: "weak_password" }, { status: 400 });

  const taken = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken.length) return Response.json({ error: "email_taken" }, { status: 409 });

  const [user] = await db
    .insert(users)
    .values({ id: newUserId(), email, displayName: body.displayName?.trim().slice(0, 40) || email.split("@")[0], passwordHash: await hashPassword(password) })
    .returning();
  await startSession(db, user.id);
  await sendLinkMail(request, db, { id: user.id, email, displayName: user.displayName }, "verify", asLocale(body.locale)).catch((err) => console.error("verify mail failed", err));
  return Response.json({ user: publicUser(user) });
}
