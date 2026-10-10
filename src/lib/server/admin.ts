import "server-only";
import { getDb } from "./db";

// 管理接口共用：請求頭的 x-admin-token 要等於 ADMIN_TOKEN。正式版換成後台帳號權限
export async function requireAdmin(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || request.headers.get("x-admin-token") !== token) return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  const db = await getDb();
  if (!db) return { error: Response.json({ error: "not_configured" }, { status: 503 }) };
  return { db };
}
