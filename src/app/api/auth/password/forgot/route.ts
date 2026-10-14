import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/lib/server/schema";
import { EMAIL_RE } from "@/lib/server/auth";
import { asLocale, sendLinkMail } from "@/lib/server/email-auth";
import { allow, clientIp, tooMany } from "@/lib/server/rate-limit";
import { fail } from "@/lib/server/require-user";

// 忘記密碼：信箱有帳號就寄重設連結。不管有沒有帳號都回一樣的結果，不透露哪些信箱註冊過
export async function POST(request: Request) {
  const db = await getDb();
  if (!db) return fail("not_configured", 503);
  const body = (await request.json().catch(() => ({}))) as { email?: string; locale?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return fail("invalid_email");
  // 每個 IP 15 分鐘 5 次；同一個信箱每小時最多 3 封，免得被拿來轟炸別人的信箱
  if (!(await allow(db, `forgot:${clientIp(request)}`, 5, 900))) return tooMany();
  if (await allow(db, `forgot-mail:${email}`, 3, 3600)) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      await sendLinkMail(request, db, { id: user.id, email, displayName: user.displayName }, "reset", asLocale(body.locale)).catch((err) => console.error("reset mail failed", err));
    }
  }
  return Response.json({ ok: true });
}
