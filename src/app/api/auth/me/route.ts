import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { currentUser } from "@/lib/server/auth";

export async function GET() {
  // 每次請求都要讀 cookie 和當時的資料庫配置，不能在構建時預渲染
  await connection();
  const db = await getDb();
  if (!db) return Response.json({ configured: false, user: null });
  return Response.json({ configured: true, user: await currentUser(db) });
}
