import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";
import type { Db } from "./db";
import { emailTokens, users } from "./schema";
import { sendMail } from "./mail";

// 郵件連結：驗證信箱 24 小時有效，重設密碼 1 小時有效。寄新的同類連結時舊的作廢，信箱裡只有最新那封能用
type Purpose = "verify" | "reset";
const TTL: Record<Purpose, number> = { verify: 24 * 3600_000, reset: 3600_000 };
const PATH: Record<Purpose, string> = { verify: "/verify-email", reset: "/reset-password" };
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const asLocale = (v: unknown): Locale => (routing.locales.includes(v as Locale) ? (v as Locale) : routing.defaultLocale);

// 正式環境一律用正式網址，不信請求的 Host（否則偽造 Host 就能讓重設連結指向別的網站）；本機用請求的來源
function linkBase(request: Request, locale: Locale) {
  const origin = process.env.NODE_ENV === "production" ? SITE_URL : new URL(request.url).origin;
  return locale === routing.defaultLocale ? origin : `${origin}/${locale}`;
}

async function issue(db: Db, userId: string, purpose: Purpose, email: string) {
  const token = randomBytes(32).toString("base64url");
  await db.delete(emailTokens).where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose)));
  await db.insert(emailTokens).values({ id: sha256(token), userId, purpose, email, expiresAt: new Date(Date.now() + TTL[purpose]) });
  return token;
}

// 用掉一個連結：刪除並回傳；過期、不存在，或帳號的信箱已經換掉時回 null
export async function consumeToken(db: Db, token: unknown, purpose: Purpose) {
  if (typeof token !== "string" || !token) return null;
  const [row] = await db
    .delete(emailTokens)
    .where(and(eq(emailTokens.id, sha256(token)), eq(emailTokens.purpose, purpose), gt(emailTokens.expiresAt, new Date())))
    .returning();
  if (!row) return null;
  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  return user && user.email === row.email ? user : null;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// 驗證信和重設密碼信共用一個版型：標題、一段說明、按鈕，下面附純文字連結和「不是你就忽略」
export async function sendLinkMail(request: Request, db: Db, user: { id: string; email: string; displayName: string }, purpose: Purpose, locale: Locale) {
  const token = await issue(db, user.id, purpose, user.email);
  const url = `${linkBase(request, locale)}${PATH[purpose]}?token=${token}`;
  // 接口路由沒有 [locale] 路由參數，不能用 getTranslations；直接讀那個語言的文案
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "Email" });
  const subject = t(`${purpose}Subject`);
  const heading = t(`${purpose}Heading`);
  const body = t(`${purpose}Body`, { name: user.displayName });
  const cta = t(`${purpose}Cta`);
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans',sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:22px;font-weight:800;letter-spacing:-0.02em">Idolca</td></tr>
<tr><td style="padding-top:24px;font-size:20px;font-weight:700">${escape(heading)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#3f3f46">${escape(body)}</td></tr>
<tr><td style="padding-top:24px"><a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px">${escape(cta)}</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;line-height:1.6;color:#71717a">${escape(t("linkFallback"))}<br><a href="${url}" style="color:#71717a;word-break:break-all">${url}</a></td></tr>
<tr><td style="padding-top:16px;font-size:12px;line-height:1.6;color:#71717a">${escape(t("ignore"))}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${body}\n\n${cta}: ${url}\n\n${t("ignore")}`;
  await sendMail({ to: user.email, subject, html, text });
}
