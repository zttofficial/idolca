import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/lib/server/schema";
import { startSession, verifyPassword } from "@/lib/server/auth";

export async function POST(request: Request) {
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const row = rows[0];
  // 帳號不存在和密碼錯誤回同一個錯誤，不透露哪些信箱註冊過
  // 用錢包建立、沒設密碼的帳號不能用郵箱登入
  if (!row?.passwordHash || !(await verifyPassword(body.password ?? "", row.passwordHash))) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  await startSession(db, row.id);
  return Response.json({ user: { id: row.id, email: row.email, displayName: row.displayName, walletAddress: row.walletAddress } });
}
