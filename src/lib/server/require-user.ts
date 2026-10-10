import "server-only";
import { getDb } from "./db";
import { currentUser } from "./auth";

// 需要登入的接口共用：資料庫未配置回 503，未登入回 401
export async function requireUser() {
  const db = await getDb();
  if (!db) return { error: Response.json({ error: "not_configured" }, { status: 503 }) };
  const user = await currentUser(db);
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  return { db, user };
}
