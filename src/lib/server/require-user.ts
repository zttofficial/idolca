import "server-only";
import { getDb, type Db } from "./db";
import { currentUser, type PublicUser } from "./auth";

// 需要登入的接口共用：資料庫未配置回 503，未登入回 401
export async function requireUser() {
  const db = await getDb();
  if (!db) return { error: Response.json({ error: "not_configured" }, { status: 503 }) };
  const user = await currentUser(db);
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  return { db, user };
}

// 需要錢包的接口（簽交易、收付款）：郵箱帳號要先綁定錢包
export async function requireWalletUser(): Promise<{ error: Response } | { db: Db; user: PublicUser; wallet: string }> {
  const a = await requireUser();
  if (a.error) return { error: a.error };
  if (!a.user.walletAddress) return { error: Response.json({ error: "no_wallet" }, { status: 409 }) };
  return { db: a.db, user: a.user, wallet: a.user.walletAddress };
}

export const fail = (error: string, status = 400) => Response.json({ error }, { status });
