import { requireUser, fail } from "@/lib/server/require-user";
import { asLocale, sendLinkMail } from "@/lib/server/email-auth";
import { allow, tooMany } from "@/lib/server/rate-limit";

// 重寄驗證信：每個帳號每小時 5 封
export async function POST(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const { email, emailVerified, id, displayName } = a.user;
  if (!email) return fail("no_email");
  if (emailVerified) return Response.json({ ok: true, alreadyVerified: true });
  if (!(await allow(a.db, `verify-mail:${id}`, 5, 3600))) return tooMany();
  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  try {
    await sendLinkMail(request, a.db, { id, email, displayName }, "verify", asLocale(body.locale));
  } catch (err) {
    console.error("verify mail failed", err);
    return fail("mail_failed", 502);
  }
  return Response.json({ ok: true });
}
