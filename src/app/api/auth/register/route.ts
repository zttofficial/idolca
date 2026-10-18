import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/lib/server/schema";
import { EMAIL_RE, MIN_PASSWORD, hashPassword, newUserId, publicUser, startSession } from "@/lib/server/auth";
import { asLocale, sendLinkMail } from "@/lib/server/email-auth";
import { allow, clientIp, tooMany } from "@/lib/server/rate-limit";
import { cleanName, isReservedName } from "@/lib/server/names";

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
  // 暱稱選填，填了就照改暱稱的規則；沒填用郵箱前綴，前綴不合規則（太短、是保留名稱）就用 user- 加帳號 id 的片段
  const typed = body.displayName?.trim() ?? "";
  const chosen = typed ? cleanName(typed) : null;
  if (typed && !chosen) return Response.json({ error: "invalid_name" }, { status: 400 });
  if (chosen && isReservedName(chosen)) return Response.json({ error: "reserved_name" }, { status: 400 });

  const taken = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken.length) return Response.json({ error: "email_taken" }, { status: 409 });

  const id = newUserId();
  const prefix = cleanName(email.split("@")[0].slice(0, 24));
  const displayName = chosen ?? (prefix && !isReservedName(prefix) ? prefix : `user-${id.replace(/[^a-z0-9]/gi, "").slice(-6)}`);
  const [user] = await db
    .insert(users)
    .values({ id, email, displayName, passwordHash: await hashPassword(password) })
    .returning();
  await startSession(db, user.id);
  await sendLinkMail(request, db, { id: user.id, email, displayName: user.displayName }, "verify", asLocale(body.locale)).catch((err) => console.error("verify mail failed", err));
  return Response.json({ user: publicUser(user) });
}
